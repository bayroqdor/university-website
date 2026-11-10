// Matnni buferga nusxalash. navigator.clipboard faqat xavfsiz sahifada (https yoki localhost) mavjud —
// oddiy http da yoki ruxsat berilmasa eski usul (yashirin textarea + execCommand) ishlatiladi.
// Natija: true — haqiqatan nusxalandi.
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* quyidagi usulga o'tamiz */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.cssText = "position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none";
    document.body.appendChild(ta);
    const sel = document.getSelection();
    const prev = sel && sel.rangeCount ? sel.getRangeAt(0) : null;
    ta.focus({ preventScroll: true });
    ta.select();
    ta.setSelectionRange(0, text.length); // iOS Safari
    const ok = document.execCommand("copy");
    ta.remove();
    if (prev && sel) {
      sel.removeAllRanges();
      sel.addRange(prev);
    }
    return ok;
  } catch {
    return false;
  }
}

/** Nusxalab bo'lmasa — foydalanuvchi o'zi nusxalashi uchun matnni oynada ko'rsatadi */
export async function copyOrPrompt(text: string, label = "Copy"): Promise<boolean> {
  const ok = await copyText(text);
  if (!ok) window.prompt(label, text);
  return ok;
}
