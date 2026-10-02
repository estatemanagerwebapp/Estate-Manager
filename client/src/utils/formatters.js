/**
 * Utility functions for currency and date formatting in Nigerian Naira (₦).
 * Adheres strictly to the project rules: zero emojis, Lucide icons, enterprise styling.
 */

export const formatNaira = (amount) => {
  const numeric = typeof amount === 'number' ? amount : parseFloat(amount) || 0;
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(numeric);
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
