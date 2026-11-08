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
  },
  {
    title: '攻略畫板',
    description: '把遊戲截圖直接貼上，在上面用畫筆、箭頭、框和文字講解攻略，畫完可以複製或下載圖片。',
    icon: 'i-lucide-presentation',
    to: '/strategy-board'
  }
]
