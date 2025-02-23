import store from '../../store'

import { NATIVE_CURRENCY } from '../../../resources/constants'
import { toTokenId } from '../../../resources/domain/balance'

import type { NativeCurrency, Rate, AssetPreferences } from '../../store/state'
import type { TokenBalance } from '../../store/state/types/token'

interface AssetsChangedHandler {
  assetsChanged: (address: Address, assets: RPC.GetAssets.Assets) => void
}

// typed access to state
const storeApi = {
  getBalances: (account: Address): TokenBalance[] => {
    return store('main.balances', account) || []
  },
  getNativeCurrency: (chainId: number): NativeCurrency => {
    const currency = store('main.networksMeta.ethereum', chainId, 'nativeCurrency')

    return currency || { usd: { price: 0 } }
  },
  getUsdRate: (tokenId: string): Record<string, Rate> => {
    const rate = store('main.rates', tokenId)

    return rate || { usd: { price: 0 } }
  },
  getLastUpdated: (account: Address): number => {
    return store('main.accounts', account, 'balances.lastUpdated')
  },
  getAssetPreferences: (): AssetPreferences => store('main.assetPreferences')
}

function createObserver(handler: AssetsChangedHandler) {
  let debouncedAssets: RPC.GetAssets.Assets | null = null

  return function () {
    const currentAccountId = store('selected.current') as string

    if (currentAccountId) {
      const assets = fetchAssets(currentAccountId)

      if (!isScanning(currentAccountId) && (assets.erc20.length > 0 || assets.nativeCurrency.length > 0)) {
        if (!debouncedAssets) {
          setTimeout(() => {
            if (debouncedAssets) {
              handler.assetsChanged(currentAccountId, debouncedAssets)
              debouncedAssets = null
            }
          }, 800)
        }

        debouncedAssets = assets
      }
    }
  }
}

function loadAssets(accountId: string) {
  if (isScanning(accountId)) throw new Error('assets not known for account')

  return fetchAssets(accountId)
}

function fetchAssets(accountId: string) {
  const balances = storeApi.getBalances(accountId)

  const response = {
    nativeCurrency: [] as RPC.GetAssets.NativeCurrency[],
    erc20: [] as RPC.GetAssets.Erc20[]
  }

  const assetPreferences = storeApi.getAssetPreferences()

  return balances.reduce((assets, balance) => {
    const prefs = assetPreferences.tokens[balance.chainId + ':' + balance.address]
    if (prefs ? prefs.hidden : balance.hideByDefault) return assets

    if (balance.address === NATIVE_CURRENCY) {
      const currency = storeApi.getNativeCurrency(balance.chainId)

      assets.nativeCurrency.push({
        ...balance,
        currencyInfo: currency
      })
    } else {
      const usdRate = storeApi.getUsdRate(toTokenId(balance))

      assets.erc20.push({
        ...balance,
        tokenInfo: {
          lastKnownPrice: usdRate
        }
      })
    }

    return assets
  }, response)
}

function isScanning(account: Address) {
  const lastUpdated = storeApi.getLastUpdated(account)
  return !lastUpdated || new Date().getTime() - lastUpdated > 1000 * 60 * 5
}

export { loadAssets, createObserver }
