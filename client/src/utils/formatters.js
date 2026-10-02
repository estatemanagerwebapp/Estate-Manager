/**
 * Utility functions for currency and date formatting in Nigerian Naira (₦).
 * Adheres strictly to the project rules: zero emojis, Lucide icons, enterprise styling.
 */

export const formatNaira = (amount, options = {}) => {
  const numeric = typeof amount === 'number' ? amount : parseFloat(amount) || 0;
  
  if (options.compact) {
    return formatCompactNaira(numeric);
  }

  const isWhole = numeric % 1 === 0;
  // If explicitly requested or auto-trimming whole figures >= ₦1,000 (saves 3 wasted chars: '.00')
  const shouldHideDecimals = options.hideDecimals === true || (options.autoTrimCents !== false && isWhole && Math.abs(numeric) >= 1000);

  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: shouldHideDecimals ? 0 : 2,
    maximumFractionDigits: shouldHideDecimals ? 0 : 2
  }).format(numeric);
};

/**
 * Compact currency formatter for high-value proptech dashboards (millions, billions).
 * Examples:
 * - 62000 -> ₦62,000
 * - 3560000 -> ₦3.56M
 * - 150000000 -> ₦150M
 * - 1250000000 -> ₦1.25B
 */
export const formatCompactNaira = (amount) => {
  const numeric = typeof amount === 'number' ? amount : parseFloat(amount) || 0;
  const abs = Math.abs(numeric);

  if (abs < 1_000_000) {
    return formatNaira(numeric, { autoTrimCents: true });
  }

  if (abs < 1_000_000_000) {
    const val = numeric / 1_000_000;
    const formatted = val % 1 === 0 ? val.toFixed(0) : (abs >= 100_000_000 ? val.toFixed(1) : val.toFixed(2)).replace(/\.0$/, '');
    return `₦${formatted}M`;
  }

  if (abs < 1_000_000_000_000) {
    const val = numeric / 1_000_000_000;
    const formatted = val % 1 === 0 ? val.toFixed(0) : val.toFixed(2).replace(/\.?0+$/, '');
    return `₦${formatted}B`;
  }

  const val = numeric / 1_000_000_000_000;
  return `₦${val.toFixed(2).replace(/\.?0+$/, '')}T`;
};

/**
 * Returns dynamic font size Tailwind class based on figure length to prevent overflow in KPI cards.
 */
export const getNairaTextSizeClass = (amount, isCompact = false) => {
  if (isCompact) return 'text-2xl';
  const numeric = Math.abs(typeof amount === 'number' ? amount : parseFloat(amount) || 0);
  if (numeric >= 1_000_000_000) return 'text-lg sm:text-xl'; // 10+ figures
  if (numeric >= 100_000_000) return 'text-xl sm:text-2xl';  // 9 figures
  if (numeric >= 10_000_000) return 'text-xl sm:text-2xl';   // 8 figures
  return 'text-2xl';
};

export const formatDate = (dateInput) => {
  if (!dateInput) return 'N/A';
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return 'N/A';
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
};

export const formatDateTime = (dateInput) => {
  if (!dateInput) return 'N/A';
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return 'N/A';
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
};

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
const SCALES = ['', 'Thousand', 'Million', 'Billion', 'Trillion'];

function convertChunk(num) {
  let str = '';
  if (num >= 100) {
    str += ONES[Math.floor(num / 100)] + ' Hundred ';
    num %= 100;
  }
  if (num >= 20) {
    str += TENS[Math.floor(num / 10)] + ' ';
    num %= 10;
  }
  if (num > 0) {
    str += ONES[num] + ' ';
  }
  return str.trim();
}

export const numberToWordsNaira = (amount) => {
  const num = Math.floor(Math.abs(typeof amount === 'number' ? amount : parseFloat(amount) || 0));
  if (num === 0) return 'Zero Nigerian Naira Only';

  let current = num;
  let scaleIndex = 0;
  let words = [];

  while (current > 0) {
    const chunk = current % 1000;
    if (chunk !== 0) {
      const chunkWords = convertChunk(chunk);
      const scale = SCALES[scaleIndex];
      words.unshift((chunkWords + (scale ? ' ' + scale : '')).trim());
    }
    current = Math.floor(current / 1000);
    scaleIndex++;
  }

  return words.join(', ') + ' Nigerian Naira Only';
};
