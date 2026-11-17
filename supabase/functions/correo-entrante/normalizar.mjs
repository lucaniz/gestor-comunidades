// Convierte el aviso de un email entrante (Postmark u otro proveedor) al formato del Gestor de Comunidades.
// Sin dependencias: se usa en la función de Supabase (Deno) y en los tests (Node).
export function quitarHtml(html) {
  return String(html || '')
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/p>|<\/div>|<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
function fechaLocal(d) {
  const t = d ? new Date(d) : new Date();
  if (isNaN(t)) return '';
  const p = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(t);
  return p.replace(' ', 'T');
}
export function normalizar(b) {
  b = b || {};
  // Postmark (Inbound webhook)
  if (b.FromFull || b.MessageID || b.TextBody !== undefined) {
    const from = (b.FromFull && b.FromFull.Email) || String(b.From || '').replace(/.*<([^>]+)>.*/, '$1');
    const texto = b.StrippedTextReply || b.TextBody || quitarHtml(b.HtmlBody);
    return {
      de: String(from || '').trim().toLowerCase(), nombre: (b.FromFull && b.FromFull.Name) || b.FromName || '',
      asunto: b.Subject || '', texto: String(texto || '').trim(), fecha: fechaLocal(b.Date),
      para: b.OriginalRecipient || b.To || '', messageId: b.MessageID || '',
      adjuntos: (b.Attachments || []).map(a => ({ nombre: a.Name, tipo: a.ContentType, bytes: a.ContentLength }))
    };
  }
  // Formato genérico: { from, name, subject, text, html, date, to, messageId }
  return {
    de: String(b.from || '').replace(/.*<([^>]+)>.*/, '$1').trim().toLowerCase(), nombre: b.name || '',
    asunto: b.subject || '', texto: String(b.text || quitarHtml(b.html)).trim(), fecha: fechaLocal(b.date),
    para: b.to || '', messageId: b.messageId || '', adjuntos: []
  };
}
