<script setup lang="ts">
import { calculateFusionCost } from '~/utils/fusionCost'

definePageMeta({
  ssr: false
})

useSeoMeta({
  title: '素材製作價格計算 - LOA Lab'
})

// 配方：製作 1 組（10 個）融合素材所需的材料與手續費
const recipeBlue = usePersistedNumber('materials-cost:recipe-blue', 33)
const recipeGreen = usePersistedNumber('materials-cost:recipe-green', 45)
const recipeWhite = usePersistedNumber('materials-cost:recipe-white', 86)
const recipeFee = usePersistedNumber('materials-cost:recipe-fee', 388)

// 市場價格：三色材料為「每組(100個)」的價格，成品為「每1個」的價格
const priceBlueLot = usePersistedNumber('materials-cost:price-blue-lot', 0)
const priceGreenLot = usePersistedNumber('materials-cost:price-green-lot', 0)
const priceWhiteLot = usePersistedNumber('materials-cost:price-white-lot', 0)
const priceFinishedUnit = usePersistedNumber('materials-cost:price-finished-unit', 0)

// 需求數量：以「組」為單位（1 組 = 10 個融合素材）
const neededBatches = usePersistedNumber('materials-cost:needed-batches', 1)

const result = computed(() =>
  calculateFusionCost(
    { blue: recipeBlue.value, green: recipeGreen.value, white: recipeWhite.value, fee: recipeFee.value },
    {
      blueLot: priceBlueLot.value,
      greenLot: priceGreenLot.value,
      whiteLot: priceWhiteLot.value,
      finishedUnit: priceFinishedUnit.value
    },
    Math.max(0, neededBatches.value)
  )
)

const plans = computed(() => {
  const r = result.value
  const items = [
    { label: '製作（自動挑最便宜來源）', total: r.craftOptimizedTotal },
    { label: '製作（全部直接買，不兌換）', total: r.craftNoExchangeTotal },
    { label: '直接買成品', total: r.buyFinishedTotal }
  ]
  const cheapestTotal = Math.min(...items.map(item => item.total))
  return items.map(item => ({ ...item, isCheapest: item.total === cheapestTotal }))
})

const savedByExchange = computed(() => result.value.craftNoExchangeTotal - result.value.craftOptimizedTotal)

const exchangeSteps = computed(() =>
  [result.value.blue.exchange, result.value.green.exchange].filter(step => step !== undefined)
)

function formatGold(value: number) {
  return `${Math.round(value).toLocaleString()} 金幣`
}
</script>

<template>
  <UContainer class="py-8 space-y-8">
    <div>
      <h1 class="text-2xl font-bold">
        素材製作價格計算
      </h1>
      <p class="text-muted mt-1">
        比較「自己做融合素材」跟「直接買成品」哪個划算，並自動考慮用便宜材料兌換的省錢空間。
      </p>
    </div>

    <UCard>
      <template #header>
        <h2 class="font-semibold">
          配方（製作 1 組 = 10 個融合素材）
        </h2>
      </template>

      <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <UFormField label="藍色材料 (個)">
          <UInput
            v-model.number="recipeBlue"
            type="number"
            min="0"
          />
        </UFormField>
        <UFormField label="綠色材料 (個)">
          <UInput
            v-model.number="recipeGreen"
            type="number"
            min="0"
          />
        </UFormField>
        <UFormField label="白色材料 (個)">
          <UInput
            v-model.number="recipeWhite"
            type="number"
            min="0"
          />
        </UFormField>
        <UFormField label="手續費 (金幣)">
          <UInput
            v-model.number="recipeFee"
            type="number"
            min="0"
          />
        </UFormField>
      </div>
    </UCard>

    <UCard>
      <template #header>
        <h2 class="font-semibold">
          市場價格
        </h2>
      </template>

      <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <UFormField label="藍色材料 (每組100個)">
          <UInput
            v-model.number="priceBlueLot"
            type="number"
            min="0"
          />
        </UFormField>
        <UFormField label="綠色材料 (每組100個)">
          <UInput
            v-model.number="priceGreenLot"
            type="number"
            min="0"
          />
        </UFormField>
        <UFormField label="白色材料 (每組100個)">
          <UInput
            v-model.number="priceWhiteLot"
            type="number"
            min="0"
          />
        </UFormField>
        <UFormField label="成品融合素材 (每1個)">
          <UInput
            v-model.number="priceFinishedUnit"
            type="number"
            min="0"
          />
        </UFormField>
      </div>
    </UCard>

    <UCard>
      <template #header>
        <h2 class="font-semibold">
          需求數量
        </h2>
      </template>

      <UFormField
        label="需要製作幾組（1 組 = 10 個融合素材）"
        class="max-w-xs"
      >
        <UInput
          v-model.number="neededBatches"
          type="number"
          min="0"
        />
      </UFormField>
    </UCard>

    <UCard>
      <template #header>
        <h2 class="font-semibold">
          採購清單（實際要去市場買的量）
        </h2>
      </template>

      <table class="w-full text-sm">
        <thead>
          <tr class="text-left text-muted border-b border-default">
            <th class="py-2 pr-4">
              材料
            </th>
            <th class="py-2 pr-4">
              要買幾組（每組100個）
            </th>
            <th class="py-2 text-right">
              實際需要個數
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-if="result.purchasePlan.blue.lots > 0"
            class="border-b border-default"
          >
            <td class="py-2 pr-4">
              藍色材料
            </td>
            <td class="py-2 pr-4 font-medium">
              {{ result.purchasePlan.blue.lots }} 組
            </td>
            <td class="py-2 text-right text-muted">
              {{ Math.ceil(result.purchasePlan.blue.units).toLocaleString() }} 個
            </td>
          </tr>
          <tr
            v-if="result.purchasePlan.green.lots > 0"
            class="border-b border-default"
          >
            <td class="py-2 pr-4">
              綠色材料
            </td>
            <td class="py-2 pr-4 font-medium">
              {{ result.purchasePlan.green.lots }} 組
            </td>
            <td class="py-2 text-right text-muted">
              {{ Math.ceil(result.purchasePlan.green.units).toLocaleString() }} 個
            </td>
          </tr>
          <tr v-if="result.purchasePlan.white.lots > 0">
            <td class="py-2 pr-4">
              白色材料
            </td>
            <td class="py-2 pr-4 font-medium">
              {{ result.purchasePlan.white.lots }} 組
            </td>
            <td class="py-2 text-right text-muted">
              {{ Math.ceil(result.purchasePlan.white.units).toLocaleString() }} 個
            </td>
          </tr>
        </tbody>
      </table>

      <div
        v-if="exchangeSteps.length > 0"
        class="mt-4 pt-4 border-t border-default space-y-2"
      >
        <p class="text-sm font-medium">
          兌換步驟
        </p>
        <p
          v-for="(step, index) in exchangeSteps"
          :key="index"
          class="text-sm text-muted"
        >
          把 {{ step!.fromUnits.toLocaleString() }} 個{{ step!.fromLabel }}
          換成 {{ step!.powderUnits.toLocaleString() }} 個粉末，
          再換成 {{ step!.toUnits.toLocaleString() }} 個{{ step!.toLabel }}
        </p>
      </div>
    </UCard>

    <UCard>
      <template #header>
        <h2 class="font-semibold">
          材料來源明細（自動挑最便宜的方式）
        </h2>
      </template>

      <table class="w-full text-sm">
        <thead>
          <tr class="text-left text-muted border-b border-default">
            <th class="py-2 pr-4">
              材料
            </th>
            <th class="py-2 pr-4">
              來源
            </th>
            <th class="py-2 pr-4">
              明細
            </th>
            <th class="py-2 text-right">
              花費
            </th>
          </tr>
        </thead>
        <tbody>
          <tr class="border-b border-default">
            <td class="py-2 pr-4">
              藍色材料
            </td>
            <td class="py-2 pr-4">
              <UBadge
                :color="result.blue.source === '直接購買' ? 'neutral' : 'primary'"
                variant="subtle"
              >
                {{ result.blue.source }}
              </UBadge>
            </td>
            <td class="py-2 pr-4 text-muted">
              {{ result.blue.detail }}
            </td>
            <td class="py-2 text-right">
              {{ formatGold(result.blue.cost) }}
            </td>
          </tr>
          <tr class="border-b border-default">
            <td class="py-2 pr-4">
              綠色材料
            </td>
            <td class="py-2 pr-4">
              <UBadge
                :color="result.green.source === '直接購買' ? 'neutral' : 'primary'"
                variant="subtle"
              >
                {{ result.green.source }}
              </UBadge>
            </td>
            <td class="py-2 pr-4 text-muted">
              {{ result.green.detail }}
            </td>
            <td class="py-2 text-right">
              {{ formatGold(result.green.cost) }}
            </td>
          </tr>
          <tr>
            <td class="py-2 pr-4">
              白色材料
            </td>
            <td class="py-2 pr-4">
              <UBadge
                color="neutral"
                variant="subtle"
              >
                直接購買
              </UBadge>
            </td>
            <td class="py-2 pr-4 text-muted">
              {{ result.white.detail }}
            </td>
            <td class="py-2 text-right">
              {{ formatGold(result.white.cost) }}
            </td>
          </tr>
        </tbody>
      </table>

      <p class="text-muted text-sm mt-3">
        手續費：{{ formatGold(result.feeTotal) }}（{{ result.batches }} 組 × {{ recipeFee }}）
      </p>
    </UCard>

    <UCard>
      <template #header>
        <h2 class="font-semibold">
          方案比較
        </h2>
      </template>

      <table class="w-full text-sm">
        <thead>
          <tr class="text-left text-muted border-b border-default">
            <th class="py-2 pr-4">
              方案
            </th>
            <th class="py-2 text-right">
              總花費
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="plan in plans"
            :key="plan.label"
            class="border-b border-default last:border-b-0"
          >
            <td class="py-2 pr-4">
              {{ plan.label }}
            </td>
            <td class="py-2 text-right font-medium">
              <span class="inline-flex items-center gap-2">
                {{ formatGold(plan.total) }}
                <UBadge
                  v-if="plan.isCheapest"
                  color="success"
                  variant="subtle"
                >
                  最划算
                </UBadge>
              </span>
            </td>
          </tr>
        </tbody>
      </table>

      <p
        v-if="savedByExchange > 0"
        class="text-muted text-sm mt-3"
      >
        用兌換省下了 {{ formatGold(savedByExchange) }}，相較於全部直接購買材料。
      </p>
    </UCard>
  </UContainer>
</template>
