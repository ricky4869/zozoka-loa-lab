export interface FusionRecipe {
  blue: number
  green: number
  white: number
  fee: number
}

export interface MarketPrices {
  blueLot: number
  greenLot: number
  whiteLot: number
  finishedUnit: number
}

export interface ExchangeStep {
  fromLabel: string
  fromUnits: number
  powderUnits: number
  toLabel: string
  toUnits: number
}

export interface SourceOption {
  source: string
  detail: string
  cost: number
  producedUnits: number
  exchange?: ExchangeStep
}

export interface PurchasePlanItem {
  units: number
  lots: number
}

export interface FusionCostResult {
  batches: number
  blueNeeded: number
  greenNeeded: number
  whiteNeeded: number
  feeTotal: number
  blue: SourceOption
  green: SourceOption
  white: SourceOption
  craftOptimizedTotal: number
  craftNoExchangeTotal: number
  buyFinishedTotal: number
  purchasePlan: {
    blue: PurchasePlanItem
    green: PurchasePlanItem
    white: PurchasePlanItem
  }
}

const SOURCE_DIRECT = '直接購買'
const SOURCE_VIA_WHITE = '白材料兌換'
const SOURCE_VIA_GREEN = '綠材料兌換'

const MARKET_LOT_SIZE = 100 // 材料市場購買的最小單位：1 組 = 100 個

// 兌換規則（固定比例的系統內轉換，只能整批操作，不能拆開）：
// 100 白材料 -> 80 粉末
const WHITE_TO_POWDER = { consume: 100, produce: 80 }
// 50 綠材料 -> 80 粉末
const GREEN_TO_POWDER = { consume: 50, produce: 80 }
// 100 粉末 -> 10 藍材料
const POWDER_TO_BLUE = { consume: 100, produce: 10 }
// 100 粉末 -> 50 綠材料
const POWDER_TO_GREEN = { consume: 100, produce: 50 }

function opsFor(targetAmount: number, producePerOp: number): number {
  return targetAmount > 0 ? Math.ceil(targetAmount / producePerOp) : 0
}

function directPurchase(units: number, lotPrice: number): { lots: number, cost: number } {
  const lots = Math.ceil(units / MARKET_LOT_SIZE)
  return { lots, cost: lots * lotPrice }
}

// 透過「來源材料 -> 粉末 -> 目標材料」兩段兌換，取得至少 targetNeeded 個目標材料。
// 兩段兌換都只能整批操作，所以來源材料用量與粉末用量都會是固定倍數，目標材料也可能因此多產出一些。
function viaPowder(
  targetNeeded: number,
  powderToTarget: { consume: number, produce: number },
  sourceToPowder: { consume: number, produce: number }
) {
  const targetOps = opsFor(targetNeeded, powderToTarget.produce)
  const powderNeeded = targetOps * powderToTarget.consume
  const sourceOps = opsFor(powderNeeded, sourceToPowder.produce)
  const sourceUnits = sourceOps * sourceToPowder.consume
  const powderProduced = sourceOps * sourceToPowder.produce
  const targetProduced = targetOps * powderToTarget.produce

  return { sourceUnits, powderProduced, targetProduced }
}

function exchangeDetail(fromLabel: string, fromUnits: number, powderUnits: number, toLabel: string, toUnits: number, needed: number): string {
  const extra = toUnits > needed ? `（多產出 ${(toUnits - needed).toLocaleString()} 個）` : ''
  return `${fromUnits.toLocaleString()} ${fromLabel} → ${powderUnits.toLocaleString()} 粉末 → ${toUnits.toLocaleString()} ${toLabel}${extra}`
}

function cheapest(options: SourceOption[]): SourceOption {
  return options.reduce((best, option) => (option.cost < best.cost ? option : best))
}

export function calculateFusionCost(
  recipe: FusionRecipe,
  prices: MarketPrices,
  batches: number
): FusionCostResult {
  const safeBatches = Math.max(0, batches)

  const blueNeeded = safeBatches * recipe.blue
  const greenNeeded = safeBatches * recipe.green
  const whiteNeeded = safeBatches * recipe.white
  const feeTotal = safeBatches * recipe.fee

  const blueDirect = directPurchase(blueNeeded, prices.blueLot)
  const greenDirect = directPurchase(greenNeeded, prices.greenLot)
  const whiteDirect = directPurchase(whiteNeeded, prices.whiteLot)

  const blueViaWhite = viaPowder(blueNeeded, POWDER_TO_BLUE, WHITE_TO_POWDER)
  const blueViaWhiteLots = directPurchase(blueViaWhite.sourceUnits, prices.whiteLot)
  const blueViaGreen = viaPowder(blueNeeded, POWDER_TO_BLUE, GREEN_TO_POWDER)
  const blueViaGreenLots = directPurchase(blueViaGreen.sourceUnits, prices.greenLot)

  const blue = cheapest([
    {
      source: SOURCE_DIRECT,
      detail: `${blueDirect.lots} 組（${blueNeeded.toLocaleString()} 個）藍材料`,
      cost: blueDirect.cost,
      producedUnits: blueNeeded
    },
    {
      source: SOURCE_VIA_WHITE,
      detail: exchangeDetail('白材料', blueViaWhite.sourceUnits, blueViaWhite.powderProduced, '藍材料', blueViaWhite.targetProduced, blueNeeded),
      cost: blueViaWhiteLots.cost,
      producedUnits: blueViaWhite.targetProduced,
      exchange: {
        fromLabel: '白材料',
        fromUnits: blueViaWhite.sourceUnits,
        powderUnits: blueViaWhite.powderProduced,
        toLabel: '藍材料',
        toUnits: blueViaWhite.targetProduced
      }
    },
    {
      source: SOURCE_VIA_GREEN,
      detail: exchangeDetail('綠材料', blueViaGreen.sourceUnits, blueViaGreen.powderProduced, '藍材料', blueViaGreen.targetProduced, blueNeeded),
      cost: blueViaGreenLots.cost,
      producedUnits: blueViaGreen.targetProduced,
      exchange: {
        fromLabel: '綠材料',
        fromUnits: blueViaGreen.sourceUnits,
        powderUnits: blueViaGreen.powderProduced,
        toLabel: '藍材料',
        toUnits: blueViaGreen.targetProduced
      }
    }
  ])

  const greenViaWhite = viaPowder(greenNeeded, POWDER_TO_GREEN, WHITE_TO_POWDER)
  const greenViaWhiteLots = directPurchase(greenViaWhite.sourceUnits, prices.whiteLot)

  const green = cheapest([
    {
      source: SOURCE_DIRECT,
      detail: `${greenDirect.lots} 組（${greenNeeded.toLocaleString()} 個）綠材料`,
      cost: greenDirect.cost,
      producedUnits: greenNeeded
    },
    {
      source: SOURCE_VIA_WHITE,
      detail: exchangeDetail('白材料', greenViaWhite.sourceUnits, greenViaWhite.powderProduced, '綠材料', greenViaWhite.targetProduced, greenNeeded),
      cost: greenViaWhiteLots.cost,
      producedUnits: greenViaWhite.targetProduced,
      exchange: {
        fromLabel: '白材料',
        fromUnits: greenViaWhite.sourceUnits,
        powderUnits: greenViaWhite.powderProduced,
        toLabel: '綠材料',
        toUnits: greenViaWhite.targetProduced
      }
    }
  ])

  const white: SourceOption = {
    source: SOURCE_DIRECT,
    detail: `${whiteDirect.lots} 組（${whiteNeeded.toLocaleString()} 個）白材料`,
    cost: whiteDirect.cost,
    producedUnits: whiteNeeded
  }

  const craftOptimizedTotal = blue.cost + green.cost + white.cost + feeTotal
  const craftNoExchangeTotal = blueDirect.cost + greenDirect.cost + whiteDirect.cost + feeTotal
  const buyFinishedTotal = safeBatches * 10 * prices.finishedUnit

  // 實際要在市場買的量：某個顏色如果是靠兌換取得，就不用直接買它本身，
  // 但要多買被拿去兌換的那個顏色的材料。加總「個數」之後只在最後湊一次組數，比較省。
  let bluePurchaseUnits = 0
  let greenPurchaseUnits = 0
  let whitePurchaseUnits = whiteNeeded

  if (blue.source === SOURCE_DIRECT) {
    bluePurchaseUnits += blueNeeded
  } else if (blue.source === SOURCE_VIA_WHITE) {
    whitePurchaseUnits += blueViaWhite.sourceUnits
  } else if (blue.source === SOURCE_VIA_GREEN) {
    greenPurchaseUnits += blueViaGreen.sourceUnits
  }

  if (green.source === SOURCE_DIRECT) {
    greenPurchaseUnits += greenNeeded
  } else if (green.source === SOURCE_VIA_WHITE) {
    whitePurchaseUnits += greenViaWhite.sourceUnits
  }

  const toLots = (units: number): PurchasePlanItem => ({
    units,
    lots: units > 0 ? Math.ceil(units / MARKET_LOT_SIZE) : 0
  })

  return {
    batches: safeBatches,
    blueNeeded,
    greenNeeded,
    whiteNeeded,
    feeTotal,
    blue,
    green,
    white,
    craftOptimizedTotal,
    craftNoExchangeTotal,
    buyFinishedTotal,
    purchasePlan: {
      blue: toLots(bluePurchaseUnits),
      green: toLots(greenPurchaseUnits),
      white: toLots(whitePurchaseUnits)
    }
  }
}
