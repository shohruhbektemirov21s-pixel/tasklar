let lockCount = 0;

/**
 * Sahifaning skrollini xavfsiz bloklash (modal, lightbox, tortma ochiq turganda).
 * Nechta modal bir-birining ustiga ochilishidan qat'i nazar,
 * faqat birinchi ochilishda hidden qilinadi.
 */
export function lockScroll() {
  lockCount++;
  if (lockCount === 1) {
    document.body.style.overflow = "hidden";
  }
}

/**
 * Bloklangan skrollni qaytarish. Faqat oxirgi modal yopilganda
 * overflow to'liq tozalanadi.
 */
export function unlockScroll() {
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount === 0) {
    document.body.style.overflow = "";
    document.documentElement.style.overflow = "";
  }
}

/**
 * Barcha skroll blokirovkalarini tozalash va skrollni darhol tiklash.
 * Sahifa almashganda yoki favqulodda holatda chaqiriladi.
 */
export function resetScrollLock() {
  lockCount = 0;
  document.body.style.overflow = "";
  document.documentElement.style.overflow = "";
}
