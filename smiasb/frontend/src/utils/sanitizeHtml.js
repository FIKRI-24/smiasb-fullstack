const ALLOWED_TAGS = new Set([
  'p',
  'br',
  'strong',
  'b',
  'em',
  'i',
  'u',
  'span',
  'div',
  'ul',
  'ol',
  'li',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'img',
  'figure',
  'figcaption'
])

const ALLOWED_STYLES = new Set([
  'color',
  'background-color',
  'font-weight',
  'text-align',
  'font-size',
  'width',
  'max-width'
])

const FONT_SIZE_MAP = {
  1: '12px',
  2: '14px',
  3: '16px',
  4: '18px',
  5: '22px',
  6: '26px',
  7: '32px'
}

const isSafeUrl = (value = '') => {
  const src = String(value || '').trim()
  return (
    src.startsWith('/uploads/') ||
    /^https?:\/\//i.test(src) ||
    /^data:image\/(png|jpe?g|gif|webp);base64,/i.test(src)
  )
}

const sanitizeStyleValue = (property, value) => {
  const raw = String(value || '').trim()
  if (!raw || /expression|javascript:|url\s*\(/i.test(raw)) return ''

  if (property === 'text-align') {
    return /^(left|right|center|justify)$/i.test(raw) ? raw.toLowerCase() : ''
  }

  if (property === 'font-size') {
    return /^(\d{1,2}(\.\d+)?)(px|rem|em|%)$/i.test(raw) ? raw : ''
  }

  if (property === 'font-weight') {
    return /^(normal|bold|[1-9]00)$/i.test(raw) ? raw.toLowerCase() : ''
  }

  if (property === 'width' || property === 'max-width') {
    return /^(\d{1,3}(\.\d+)?)(%|px)$/i.test(raw) ? raw : ''
  }

  if (property === 'color' || property === 'background-color') {
    return (
      /^#[0-9a-f]{3,8}$/i.test(raw) ||
      /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(\s*,\s*(0|1|0?\.\d+))?\s*\)$/i.test(raw) ||
      /^hsla?\(\s*\d{1,3}\s*,\s*\d{1,3}%\s*,\s*\d{1,3}%(\s*,\s*(0|1|0?\.\d+))?\s*\)$/i.test(raw) ||
      /^[a-z]+$/i.test(raw)
    )
      ? raw
      : ''
  }

  return ''
}

const sanitizeStyle = (style = '') => {
  const safe = []

  String(style || '').split(';').forEach((chunk) => {
    const [rawProperty, ...valueParts] = chunk.split(':')
    const property = String(rawProperty || '').trim().toLowerCase()
    if (!ALLOWED_STYLES.has(property)) return

    const value = sanitizeStyleValue(property, valueParts.join(':'))
    if (value) safe.push(`${property}: ${value}`)
  })

  return safe.join('; ')
}

const normalizeLegacyFontTags = (doc) => {
  doc.querySelectorAll('font').forEach((font) => {
    const span = doc.createElement('span')
    const styles = []
    const size = font.getAttribute('size')
    const color = font.getAttribute('color')

    if (FONT_SIZE_MAP[size]) styles.push(`font-size: ${FONT_SIZE_MAP[size]}`)
    if (color) {
      const safeColor = sanitizeStyleValue('color', color)
      if (safeColor) styles.push(`color: ${safeColor}`)
    }

    if (styles.length > 0) span.setAttribute('style', styles.join('; '))
    while (font.firstChild) span.appendChild(font.firstChild)
    font.replaceWith(span)
  })
}

const unwrapElement = (el) => {
  const parent = el.parentNode
  if (!parent) return
  while (el.firstChild) parent.insertBefore(el.firstChild, el)
  parent.removeChild(el)
}

export const sanitizeRichHtml = (html = '') => {
  if (!html || typeof window === 'undefined' || !window.DOMParser) return ''

  const parser = new window.DOMParser()
  const doc = parser.parseFromString(String(html), 'text/html')

  doc.querySelectorAll('script, iframe, object, embed, form, input, button, textarea, select, link, meta').forEach(el => el.remove())
  normalizeLegacyFontTags(doc)

  Array.from(doc.body.querySelectorAll('*')).forEach((el) => {
    const tag = el.tagName.toLowerCase()

    if (!ALLOWED_TAGS.has(tag)) {
      unwrapElement(el)
      return
    }

    Array.from(el.attributes).forEach((attr) => {
      const name = attr.name.toLowerCase()
      const value = attr.value || ''

      if (name.startsWith('on') || name === 'srcdoc' || /^javascript:/i.test(value)) {
        el.removeAttribute(attr.name)
        return
      }

      if (name === 'style') {
        const safeStyle = sanitizeStyle(value)
        if (safeStyle) el.setAttribute('style', safeStyle)
        else el.removeAttribute(attr.name)
        return
      }

      if (tag === 'img' && name === 'src') {
        if (isSafeUrl(value)) el.setAttribute('src', value)
        else el.removeAttribute(attr.name)
        return
      }

      if (tag === 'img' && ['alt', 'title'].includes(name)) return

      if (name === 'class') {
        const safeClass = value
          .split(/\s+/)
          .filter(item => /^[a-z0-9_-]+$/i.test(item))
          .join(' ')

        if (safeClass) el.setAttribute('class', safeClass)
        else el.removeAttribute(attr.name)
        return
      }

      el.removeAttribute(attr.name)
    })
  })

  return doc.body.innerHTML
}

export const stripHtml = (html = '') => {
  if (!html) return ''
  if (typeof window !== 'undefined' && window.DOMParser) {
    const parser = new window.DOMParser()
    const doc = parser.parseFromString(String(html), 'text/html')
    return doc.body.textContent || ''
  }

  return String(html).replace(/<[^>]*>/g, '')
}
