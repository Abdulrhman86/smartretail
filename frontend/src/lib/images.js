import product1Image from '@/assets/smart-retail/product-1.jpg';
import product2Image from '@/assets/smart-retail/product-2.jpg';
import product3Image from '@/assets/smart-retail/product-3.jpg';
import product4Image from '@/assets/smart-retail/product-4.jpg';
import product5Image from '@/assets/smart-retail/product-5.jpg';
import product6Image from '@/assets/smart-retail/product-6.jpg';
import product7Image from '@/assets/smart-retail/product-7.jpg';
import product8Image from '@/assets/smart-retail/product-8.jpg';

export const FALLBACK_IMAGES = [
  product1Image,
  product2Image,
  product3Image,
  product4Image,
  product5Image,
  product6Image,
  product7Image,
  product8Image,
];

/** Stable fallback per product so the same item always shows the same local image. */
export function fallbackImageFor(key = '') {
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return FALLBACK_IMAGES[hash % FALLBACK_IMAGES.length];
}

/** onError handler: swap a broken remote image for a local fallback (once). */
export function handleImageError(key) {
  return (event) => {
    event.currentTarget.onerror = null;
    event.currentTarget.src = fallbackImageFor(key);
  };
}
