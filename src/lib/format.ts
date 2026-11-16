const kr = new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 })
const num = new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 2 })

export const formatKr = (v: number) => kr.format(v)
export const formatM = (mm: number) => `${num.format(mm / 1000)} m`
