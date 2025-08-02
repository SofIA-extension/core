import { useState, useEffect } from 'react'
import { Storage } from '@plasmohq/storage'

export interface OnChainTriplet {
  id: string
  triplet: {
    subject: string
    predicate: string
    object: string
  }
  atomVaultId: string // VaultID de l'atom Object
  txHash?: string
  timestamp: number
  source: 'created' | 'existing'
  url: string
  ipfsUri: string
  originalMessage?: {
    rawObjectDescription?: string
    rawObjectUrl?: string
  }
  // Nouvelles propriétés pour les triplets on-chain
  tripleVaultId?: string // VaultID du triplet complet si créé on-chain
  tripleStatus: 'atom-only' | 'on-chain' // État du triplet
  subjectVaultId?: string // VaultID de l'atom User
  predicateVaultId?: string // VaultID de l'atom Predicate
}

const storage = new Storage()
const STORAGE_KEY = 'onChainTriplets'
const INDEX_KEY = 'onChainTriplets_index'
const CHUNK_SIZE = 8 // Nombre de triplets par chunk pour éviter les quotas

interface StorageIndex {
  chunks: string[]
  totalCount: number
  lastChunk: string | null
}

// Fonctions de gestion du stockage fractionné
const getStorageIndex = async (): Promise<StorageIndex> => {
  const index = await storage.get(INDEX_KEY)
  return index || { chunks: [], totalCount: 0, lastChunk: null }
}

const saveStorageIndex = async (index: StorageIndex) => {
  await storage.set(INDEX_KEY, index)
}

const getChunkKey = (chunkNumber: number): string => {
  return `${STORAGE_KEY}_${chunkNumber}`
}

const getNextChunkNumber = (chunks: string[]): number => {
  if (chunks.length === 0) return 1
  const numbers = chunks.map(chunk => parseInt(chunk.split('_').pop() || '0'))
  return Math.max(...numbers) + 1
}

export const useOnChainTriplets = () => {
  const [triplets, setTriplets] = useState<OnChainTriplet[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  // Load triplets from storage
  useEffect(() => {
    loadTriplets()
  }, [])

  const loadTriplets = async () => {
    setIsLoading(true)
    try {
      // Vérifier s'il faut migrer l'ancien stockage
      const oldData = await storage.get(STORAGE_KEY)
      if (oldData && Array.isArray(oldData)) {
        console.log('🔄 Migrating old storage to chunked system...')
        await migrateToChunkedStorage(oldData)
        await storage.remove(STORAGE_KEY) // Supprimer l'ancien
      }

      // Charger depuis le système fractionné
      const index = await getStorageIndex()
      let allTriplets: OnChainTriplet[] = []

      for (const chunkKey of index.chunks) {
        try {
          const chunkData = await storage.get(chunkKey)
          if (chunkData && Array.isArray(chunkData)) {
            allTriplets.push(...chunkData)
          }
        } catch (chunkErr) {
          console.error(`❌ Failed to load chunk ${chunkKey}:`, chunkErr)
        }
      }

      setTriplets(allTriplets)
      console.log('📱 Loaded chunked triplets:', allTriplets.length, 'from', index.chunks.length, 'chunks')
    } catch (err) {
      console.error('❌ Failed to load on-chain triplets:', err)
      setError(err instanceof Error ? err : new Error('Unknown error'))
    } finally {
      setIsLoading(false)
    }
  }

  // Migration de l'ancien système vers le système fractionné
  const migrateToChunkedStorage = async (oldTriplets: OnChainTriplet[]) => {
    const chunks: string[] = []
    
    for (let i = 0; i < oldTriplets.length; i += CHUNK_SIZE) {
      const chunkNumber = Math.floor(i / CHUNK_SIZE) + 1
      const chunkKey = getChunkKey(chunkNumber)
      const chunkData = oldTriplets.slice(i, i + CHUNK_SIZE)
      
      await storage.set(chunkKey, chunkData)
      chunks.push(chunkKey)
      console.log(`✅ Migrated chunk ${chunkNumber}: ${chunkData.length} triplets`)
    }

    const index: StorageIndex = {
      chunks,
      totalCount: oldTriplets.length,
      lastChunk: chunks.length > 0 ? chunks[chunks.length - 1] : null
    }
    
    await saveStorageIndex(index)
    console.log('✅ Migration completed:', chunks.length, 'chunks created')
  }

  const addTriplet = async (newTriplet: Omit<OnChainTriplet, 'id' | 'timestamp'>) => {
    try {
      const tripletWithId: OnChainTriplet = {
        ...newTriplet,
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: Date.now(),
        tripleStatus: newTriplet.tripleStatus || 'atom-only' // Par défaut atom-only
      }

      // Mettre à jour l'état local
      const updatedTriplets = [...triplets, tripletWithId]
      setTriplets(updatedTriplets)

      // Sauvegarder dans le système fractionné
      await saveTripletsToChunks(updatedTriplets)
      
      console.log('✅ Added triplet to chunked storage:', tripletWithId.id)
      return tripletWithId.id
    } catch (err) {
      console.error('❌ Failed to add on-chain triplet:', err)
      setError(err instanceof Error ? err : new Error('Unknown error'))
      throw err
    }
  }

  // Fonction pour sauvegarder tous les triplets dans le système fractionné
  const saveTripletsToChunks = async (allTriplets: OnChainTriplet[]) => {
    try {
      // Supprimer les anciens chunks
      const oldIndex = await getStorageIndex()
      for (const chunkKey of oldIndex.chunks) {
        await storage.remove(chunkKey)
      }

      // Créer nouveaux chunks
      const newChunks: string[] = []
      
      for (let i = 0; i < allTriplets.length; i += CHUNK_SIZE) {
        const chunkNumber = Math.floor(i / CHUNK_SIZE) + 1
        const chunkKey = getChunkKey(chunkNumber)
        const chunkData = allTriplets.slice(i, i + CHUNK_SIZE)
        
        await storage.set(chunkKey, chunkData)
        newChunks.push(chunkKey)
      }

      // Mettre à jour l'index
      const newIndex: StorageIndex = {
        chunks: newChunks,
        totalCount: allTriplets.length,
        lastChunk: newChunks.length > 0 ? newChunks[newChunks.length - 1] : null
      }
      
      await saveStorageIndex(newIndex)
      console.log('💾 Saved to chunks:', newChunks.length, 'chunks for', allTriplets.length, 'triplets')
    } catch (err) {
      console.error('❌ Failed to save to chunks:', err)
      throw err
    }
  }

  const removeTriplet = async (id: string) => {
    try {
      const updatedTriplets = triplets.filter(t => t.id !== id)
      setTriplets(updatedTriplets)
      await saveTripletsToChunks(updatedTriplets)
      
      console.log('🗑️ Removed triplet from chunked storage:', id)
    } catch (err) {
      console.error('❌ Failed to remove on-chain triplet:', err)
      setError(err instanceof Error ? err : new Error('Unknown error'))
      throw err
    }
  }

  const clearAllTriplets = async () => {
    try {
      // Supprimer tous les chunks
      const index = await getStorageIndex()
      for (const chunkKey of index.chunks) {
        await storage.remove(chunkKey)
      }
      
      // Réinitialiser l'index
      const emptyIndex: StorageIndex = {
        chunks: [],
        totalCount: 0,
        lastChunk: null
      }
      await saveStorageIndex(emptyIndex)
      
      setTriplets([])
      console.log('🧹 Cleared all chunked triplets')
    } catch (err) {
      console.error('❌ Failed to clear on-chain triplets:', err)
      setError(err instanceof Error ? err : new Error('Unknown error'))
      throw err
    }
  }

  const getTripletsBySource = (source: 'created' | 'existing') => {
    return triplets.filter(t => t.source === source)
  }

  const getTripletsCount = () => {
    return {
      total: triplets.length,
      created: triplets.filter(t => t.source === 'created').length,
      existing: triplets.filter(t => t.source === 'existing').length,
      atomOnly: triplets.filter(t => t.tripleStatus === 'atom-only').length,
      onChain: triplets.filter(t => t.tripleStatus === 'on-chain').length
    }
  }

  // Nouvelle fonction pour mettre à jour un triplet vers le statut on-chain
  const updateTripletToOnChain = async (
    tripletId: string,
    tripleVaultId: string,
    subjectVaultId: string,
    predicateVaultId: string,
    objectVaultId: string,
    tripleTxHash?: string
  ) => {
    try {
      console.log(`🔄 updateTripletToOnChain DÉBUT - tripletId: ${tripletId}`)
      
      // RECHARGEMENT FORCÉ depuis le storage pour avoir l'état le plus récent
      console.log(`🔄 Rechargement forcé depuis storage...`)
      const index = await getStorageIndex()
      let freshTriplets: OnChainTriplet[] = []

      for (const chunkKey of index.chunks) {
        try {
          const chunkData = await storage.get(chunkKey)
          if (chunkData && Array.isArray(chunkData)) {
            freshTriplets.push(...chunkData)
          }
        } catch (chunkErr) {
          console.error(`❌ Failed to load chunk ${chunkKey}:`, chunkErr)
        }
      }
      
      console.log(`🔄 Triplets rechargés depuis storage (${freshTriplets.length}):`, freshTriplets.map(t => `${t.id}: ${t.tripleStatus}`))
      
      const tripletToUpdate = freshTriplets.find(t => t.id === tripletId)
      if (!tripletToUpdate) {
        console.error(`❌ Triplet ${tripletId} non trouvé dans storage`)
        throw new Error(`Triplet ${tripletId} not found`)
      }
      
      console.log(`🔄 Triplet trouvé: ${tripletToUpdate.triplet.subject} (statut: ${tripletToUpdate.tripleStatus})`)
      
      const updatedTriplets = freshTriplets.map(t => 
        t.id === tripletId 
          ? {
              ...t,
              tripleVaultId,
              subjectVaultId,
              predicateVaultId,
              atomVaultId: objectVaultId, // Update object vault ID
              tripleStatus: 'on-chain' as const,
              txHash: tripleTxHash || t.txHash,
              // Si l'ipfsUri était en attente, on peut le mettre à jour ici si nécessaire
              ipfsUri: t.ipfsUri === 'pending' ? 'updated' : t.ipfsUri
            }
          : t
      )
      
      const updatedTriplet = updatedTriplets.find(t => t.id === tripletId)
      console.log(`🔄 Après map - nouveau statut: ${updatedTriplet?.tripleStatus}`)
      console.log(`🔄 Nombre triplets on-chain après update: ${updatedTriplets.filter(t => t.tripleStatus === 'on-chain').length}`)
      
      console.log(`🔄 Sauvegarde dans storage...`)
      await saveTripletsToChunks(updatedTriplets)
      
      console.log(`🔄 Appel setTriplets avec ${updatedTriplets.length} triplets`)
      setTriplets(updatedTriplets)
      
      // Force un refresh immédiat pour s'assurer que l'état est synchronisé
      console.log(`🔄 Vérification post-setTriplets...`)
      setTimeout(() => {
        console.log(`🔄 État triplets après setTriplets: ${triplets.filter(t => t.tripleStatus === 'on-chain').length} on-chain`)
      }, 50)
      
      console.log('✅ Updated triplet to on-chain status:', tripletId)
    } catch (err) {
      console.error('❌ Failed to update triplet to on-chain:', err)
      setError(err instanceof Error ? err : new Error('Unknown error'))
      throw err
    }
  }

  return {
    triplets,
    isLoading,
    error,
    addTriplet,
    removeTriplet,
    clearAllTriplets,
    getTripletsBySource,
    getTripletsCount,
    updateTripletToOnChain,
    refreshTriplets: loadTriplets
  }
}