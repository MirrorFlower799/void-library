const pdfjsPath = path => new URL(`vendor/pdfjs/${path}`, import.meta.url).toString()

import './vendor/pdfjs/pdf.mjs'
const pdfjsLib = globalThis.pdfjsLib
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsPath('pdf.worker.mjs')

const fetchText = async url => {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`Missing PDF resource: ${url} (${response.status})`)
    return response.text()
}

// https://raw.githubusercontent.com/mozilla/pdf.js/refs/tags/v5.5.207/web/text_layer_builder.css
const textLayerBuilderCSS = await fetchText(pdfjsPath('text_layer_builder.css'))

// https://raw.githubusercontent.com/mozilla/pdf.js/refs/tags/v5.5.207/web/annotation_layer_builder.css
const annotationLayerBuilderCSS = await fetchText(pdfjsPath('annotation_layer_builder.css'))

// Each PDF page uses one active canvas render. Text selection and annotations
// are added after the first paint rather than blocking the displayed page.
const activeRenders = new WeakMap()
const cancelRender = doc => {
    if (!doc) return
    const state = activeRenders.get(doc)
    if (!state) return
    activeRenders.delete(doc)
    state.task?.cancel()
    state.textLayer?.cancel()
    if (state.idle != null) {
        if (typeof cancelIdleCallback === 'function') cancelIdleCallback(state.idle)
        else clearTimeout(state.idle)
    }
}
const isActive = (doc, state) => activeRenders.get(doc) === state
const render = async (page, doc, zoom, rasters, onPaint) => {
    if (!doc?.documentElement?.isConnected) return
    const previous = activeRenders.get(doc)
    if (previous?.zoom === zoom && previous.page === page) return previous.promise
    cancelRender(doc)
    const state = { page, zoom, task: null, textLayer: null, idle: null }
    activeRenders.set(doc, state)
    state.promise = renderDocument(page, doc, zoom, state, rasters).then(() => {
        if (isActive(doc, state)) onPaint?.()
    }).catch(error => {
        if (error.name !== 'RenderingCancelledException' && isActive(doc, state))
            throw error
    })
    return state.promise
}
const scheduleAuxLayers = (page, doc, viewport, state) => {
    const run = () => {
        state.idle = null
        if (!isActive(doc, state)) return
        renderAuxLayers(page, doc, viewport, state).catch(error => {
            if (isActive(doc, state) && error.name !== 'RenderingCancelledException')
                console.warn('PDF text/annotation layer:', error)
        })
    }
    if (typeof requestIdleCallback === 'function')
        state.idle = requestIdleCallback(run, { timeout: 300 })
    else state.idle = setTimeout(run, 16)
}
const renderDocument = async (page, doc, zoom, state, rasters) => {
    const base = page.getViewport({ scale: zoom })
    // Limit work on high-DPI displays: large 8MP+ canvases were a major
    // bottleneck. 4MP is enough for a readable fit-page preview; zooming in
    // will request an appropriate new rasterization at the new scale.
    const pixelRatio = Math.max(0.1, Math.min(devicePixelRatio || 1, 1.5,
        Math.sqrt(4_000_000 / Math.max(1, base.width * base.height))))
    const scale = zoom * pixelRatio
    doc.documentElement.style.transform = `scale(${1 / pixelRatio})`
    doc.documentElement.style.transformOrigin = 'top left'
    doc.documentElement.style.setProperty('--scale-factor', scale)
    const viewport = page.getViewport({ scale })
    const canvas = document.createElement('canvas')
    canvas.height = Math.ceil(viewport.height)
    canvas.width = Math.ceil(viewport.width)
    const canvasContext = canvas.getContext('2d', { alpha: false })
    if (!canvasContext) throw new Error('无法创建 PDF 画布')
    const cacheKey = `${page.pageNumber}:${canvas.width}x${canvas.height}`
    const cached = rasters?.get(cacheKey)
    if (cached) {
        // Reopening a recently visited page becomes a cheap GPU copy instead
        // of a second full PDF.js paint, including when going back a spread.
        rasters.delete(cacheKey)
        rasters.set(cacheKey, cached)
        canvasContext.drawImage(cached, 0, 0)
    } else {
        state.task = page.render({ canvasContext, viewport })
        await state.task.promise
        if (!isActive(doc, state)) return
        if (rasters && typeof createImageBitmap === 'function') {
            createImageBitmap(canvas).then(bitmap => {
                if (!isActive(doc, state)) { bitmap.close(); return }
                rasters.set(cacheKey, bitmap)
                let pixels = 0
                for (const image of rasters.values()) pixels += image.width * image.height
                // Keep at most 48MiB of pixel buffers, even for massive books.
                while (pixels > 12_000_000 && rasters.size > 1) {
                    const key = rasters.keys().next().value
                    const old = rasters.get(key)
                    pixels -= old.width * old.height
                    old.close()
                    rasters.delete(key)
                }
            }).catch(() => {})
        }
    }
    if (!isActive(doc, state)) return
    doc.querySelector('#canvas')?.replaceChildren(doc.adoptNode(canvas))
    // Paint first: parsing text and links may take hundreds of milliseconds on
    // scanned/large PDFs, but it is not required for the bitmap to be visible.
    scheduleAuxLayers(page, doc, viewport, state)
}
const renderAuxLayers = async (page, doc, viewport, state) => {
    const container = doc.querySelector('.textLayer')
    if (!container) return
    container.replaceChildren()
    const textLayer = new pdfjsLib.TextLayer({
        textContentSource: await page.streamTextContent(),
        container, viewport,
    })
    if (!isActive(doc, state)) return
    state.textLayer = textLayer
    await textLayer.render()
    if (!isActive(doc, state)) return

    for (const canvas of doc.querySelectorAll('.hiddenCanvasElement'))
        Object.assign(canvas.style, {
            position: 'absolute', top: '0', left: '0',
            width: '0', height: '0', display: 'none',
        })
    const endOfContent = doc.createElement('div')
    endOfContent.className = 'endOfContent'
    container.append(endOfContent)
    container.onpointerdown = () => container.classList.add('selecting')
    container.onpointerup = () => container.classList.remove('selecting')

    const div = doc.querySelector('.annotationLayer')
    if (!div) return
    div.replaceChildren()
    const linkService = {
        goToDestination: () => {},
        getDestinationHash: dest => JSON.stringify(dest),
        addLinkAttributes: (link, url) => link.href = url,
    }
    const annotations = await page.getAnnotations()
    if (!isActive(doc, state)) return
    await new pdfjsLib.AnnotationLayer({ page, viewport, div, linkService })
        .render({ annotations })
}

const renderPage = async (page, getImageBlob) => {
    const viewport = page.getViewport({ scale: 1 })
    if (getImageBlob) {
        const canvas = document.createElement('canvas')
        canvas.height = viewport.height
        canvas.width = viewport.width
        const canvasContext = canvas.getContext('2d')
        await page.render({ canvasContext, viewport }).promise
        return new Promise(resolve => canvas.toBlob(resolve))
    }
    const src = URL.createObjectURL(new Blob([`
        <!DOCTYPE html>
        <html lang="en">
        <meta charset="utf-8">
        <meta name="viewport" content="width=${viewport.width}, height=${viewport.height}">
        <style>
        html, body {
            margin: 0;
            padding: 0;
        }
        /*
        https://github.com/mozilla/pdf.js/commit/bd05b255fabfc313b194bfe9a17ccded4d90fb5a
        */
        :root {
          --user-unit: 1;
          --total-scale-factor: calc(var(--scale-factor) * var(--user-unit));
          --scale-round-x: 1px;
          --scale-round-y: 1px;
        }
        ${textLayerBuilderCSS}
        ${annotationLayerBuilderCSS}
        </style>
        <div id="canvas"></div>
        <div class="textLayer"></div>
        <div class="annotationLayer"></div>
    `], { type: 'text/html' }))
    const onZoom = ({ doc, scale }) => render(page, doc, scale).catch(error => console.error(error))
    return { src, onZoom }
}

const makeTOCItem = item => ({
    label: item.title,
    href: JSON.stringify(item.dest),
    subitems: item.items.length ? item.items.map(makeTOCItem) : null,
})

export const makePDF = async file => {
    const transport = new pdfjsLib.PDFDataRangeTransport(file.size, [])
    let loadingTask
    transport.requestDataRange = (begin, end) => {
        file.slice(begin, end).arrayBuffer().then(chunk => {
            transport.onDataRange(begin, chunk)
        }).catch(() => loadingTask?.destroy())
    }
    transport.abort = () => file.destroy?.()
    loadingTask = pdfjsLib.getDocument({
        range: transport,
        disableStream: true,
        cMapUrl: pdfjsPath('cmaps/'),
        standardFontDataUrl: pdfjsPath('standard_fonts/'),
        wasmUrl: pdfjsPath('wasm/'),
        disableAutoFetch: true,
        rangeChunkSize: 256 * 1024,
        isEvalSupported: false,
    })
    const pdf = await loadingTask.promise

    const book = { rendition: { layout: 'pre-paginated' } }

    const [metadataResult, outline] = await Promise.all([
        pdf.getMetadata(), pdf.getOutline(),
    ])
    const { metadata, info } = metadataResult ?? {}
    // TODO: for better results, parse `metadata.getRaw()`
    book.metadata = {
        title: metadata?.get('dc:title') ?? info?.Title,
        author: metadata?.get('dc:creator') ?? info?.Author,
        contributor: metadata?.get('dc:contributor'),
        description: metadata?.get('dc:description') ?? info?.Subject,
        language: metadata?.get('dc:language'),
        publisher: metadata?.get('dc:publisher'),
        subject: metadata?.get('dc:subject'),
        identifier: metadata?.get('dc:identifier'),
        source: metadata?.get('dc:source'),
        rights: metadata?.get('dc:rights'),
    }

    book.toc = outline?.map(makeTOCItem)

    // Cache promises for neighboring page objects; this avoids redundant
    // parsing and allows the next page to become responsive when available.
    const pages = new Map()
    const getPage = number => {
        if (pages.has(number)) return pages.get(number)
        const promise = pdf.getPage(number).catch(error => {
            pages.delete(number)
            throw error
        })
        pages.set(number, promise)
        while (pages.size > 8) pages.delete(pages.keys().next().value)
        return promise
    }
    const idlePrefetch = new Set()
    let destroyed = false
    const prefetchAfterPaint = index => {
        if (destroyed || index + 2 > pdf.numPages || idlePrefetch.size > 2) return
        const run = () => { idlePrefetch.delete(ticket); if (!destroyed) getPage(index + 2).catch(() => {}) }
        const ticket = typeof requestIdleCallback === 'function'
            ? requestIdleCallback(run, { timeout: 800 })
            : setTimeout(run, 150)
        idlePrefetch.add(ticket)
    }
    const cache = new Map()
    const rasters = new Map()
    book.sections = Array.from({ length: pdf.numPages }).map((_, i) => ({
        id: i,
        load: async () => {
            const cached = cache.get(i)
            if (cached) { cache.delete(i); cache.set(i, cached); return cached }
            const page = await getPage(i + 1)
            const url = await renderPage(page)
            url.onUnload = ({ doc }) => cancelRender(doc)
            // The generated HTML can be reused; raster cache is scoped to
            // this specific PDF so different books never share page pixels.
            url.onZoom = ({ doc, scale }) => render(page, doc, scale, rasters,
                () => prefetchAfterPaint(i)).catch(error => console.error(error))
            cache.set(i, url)
            while (cache.size > 6) {
                const oldest = cache.keys().next().value
                URL.revokeObjectURL(cache.get(oldest).src)
                cache.delete(oldest)
            }
            return url
        },
        size: 1000,
    }))
    book.isExternal = uri => /^\w+:/i.test(uri)
    book.resolveHref = async href => {
        const parsed = JSON.parse(href)
        const dest = typeof parsed === 'string'
            ? await pdf.getDestination(parsed) : parsed
        const index = await pdf.getPageIndex(dest[0])
        return { index }
    }
    book.splitTOCHref = async href => {
        const parsed = JSON.parse(href)
        const dest = typeof parsed === 'string'
            ? await pdf.getDestination(parsed) : parsed
        const index = await pdf.getPageIndex(dest[0])
        return [index, null]
    }
    book.getTOCFragment = doc => doc.documentElement
    book.getCover = async () => renderPage(await getPage(1), true)
    book.destroy = () => {
        destroyed = true
        for (const cached of cache.values()) URL.revokeObjectURL(cached.src)
        cache.clear()
        for (const bitmap of rasters.values()) bitmap.close()
        rasters.clear()
        for (const ticket of idlePrefetch) {
            if (typeof cancelIdleCallback === 'function') cancelIdleCallback(ticket)
            else clearTimeout(ticket)
        }
        idlePrefetch.clear()
        pages.clear()
        file.destroy?.()
        return pdf.destroy()
    }
    return book
}
