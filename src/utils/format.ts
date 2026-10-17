export const formatCurrency = (value: string | number) => {
  const num = typeof value === 'string' ? Number(value.replace(/[^0-9.-]+/g, "")) : value;
  if (isNaN(num)) return String(value);

  return `$ ${new Intl.NumberFormat('de-DE').format(num)}`;
};

export const normalizePhone = (phone: string) => {
  if (!phone) return '';
  const digits = phone.replace(/[^0-9]/g, '');
  if (digits.length >= 10) {
    return digits.slice(-10);
  }
  return digits;
};

export const comparePhones = (phone1?: string, phone2?: string): boolean => {
  if (!phone1 || !phone2) return false;
  return normalizePhone(phone1) === normalizePhone(phone2);
};
