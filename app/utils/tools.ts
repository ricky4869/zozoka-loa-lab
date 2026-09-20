export interface ToolLink {
  title: string
  description: string
  icon: string
  to: string
}

export const tools: ToolLink[] = [
  {
    title: '素材製作價格計算',
    description: '比較自己做融合素材跟直接買成品哪個划算，並自動考慮材料兌換的省錢空間。',
    icon: 'i-lucide-calculator',
    to: '/materials-cost'
  }
]
