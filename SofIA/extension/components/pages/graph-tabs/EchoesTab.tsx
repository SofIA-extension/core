import { useState, useEffect } from 'react'
import { Storage } from '@plasmohq/storage'
import { useOnChainTriplets, type OnChainTriplet } from '../../../hooks/useOnChainTriplets'
import { useCreateTripleOnChain } from '../../../hooks/useCreateTripleOnChain'
import { useMetaMaskAA } from '../../../hooks/useMetaMaskAA_Pure'
import QuickActionButton from '../../ui/QuickActionButton'
import type { Message, ParsedSofiaMessage, Triplet } from './types'
import { parseSofiaMessage } from './types'
import '../../styles/AtomCreationModal.css'
import '../../styles/MyGraphPage.css'
import '../../styles/BatchSelection.css'

const storage = new Storage()

// Configuration pour le stockage fractionné des extractedTriplets
const EXTRACTED_TRIPLETS_KEY = 'extractedTriplets'
const EXTRACTED_INDEX_KEY = 'extractedTriplets_index'
const EXTRACTED_CHUNK_SIZE = 5 // Taille réduite car les messages SofIA sont plus volumineux

interface ExtractedTripletsIndex {
  chunks: string[]
  totalCount: number
  lastChunk: string | null
}

// Fonctions utilitaires pour le stockage fractionné des extractedTriplets
const getExtractedTripletsIndex = async (): Promise<ExtractedTripletsIndex> => {
  const index = await storage.get(EXTRACTED_INDEX_KEY)
  return index || { chunks: [], totalCount: 0, lastChunk: null }
}

const saveExtractedTripletsIndex = async (index: ExtractedTripletsIndex) => {
  await storage.set(EXTRACTED_INDEX_KEY, index)
}

const getExtractedChunkKey = (chunkNumber: number): string => {
  return `${EXTRACTED_TRIPLETS_KEY}_${chunkNumber}`
}

const getNextExtractedChunkNumber = (chunks: string[]): number => {
  if (chunks.length === 0) return 1
  const numbers = chunks.map(chunk => parseInt(chunk.split('_').pop() || '0'))
  return Math.max(...numbers) + 1
}

// Charger tous les extractedTriplets depuis les chunks
const loadAllExtractedTriplets = async (): Promise<ParsedSofiaMessage[]> => {
  try {
    const index = await getExtractedTripletsIndex()
    let allExtractedTriplets: ParsedSofiaMessage[] = []

    for (const chunkKey of index.chunks) {
      try {
        const chunkData = await storage.get(chunkKey)
        if (chunkData && Array.isArray(chunkData)) {
          allExtractedTriplets.push(...chunkData)
        }
      } catch (chunkErr) {
        console.error(`❌ Failed to load extracted chunk ${chunkKey}:`, chunkErr)
      }
    }

    console.log('📱 Loaded extracted triplets from chunks:', allExtractedTriplets.length, 'from', index.chunks.length, 'chunks')
    return allExtractedTriplets
  } catch (err) {
    console.error('❌ Failed to load extracted triplets from chunks:', err)
    return []
  }
}

// Sauvegarder extractedTriplets dans le système fractionné
const saveExtractedTripletsToChunks = async (allExtractedTriplets: ParsedSofiaMessage[]) => {
  try {
    // Supprimer les anciens chunks
    const oldIndex = await getExtractedTripletsIndex()
    for (const chunkKey of oldIndex.chunks) {
      await storage.remove(chunkKey)
    }

    // Créer nouveaux chunks
    const newChunks: string[] = []
    
    for (let i = 0; i < allExtractedTriplets.length; i += EXTRACTED_CHUNK_SIZE) {
      const chunkNumber = Math.floor(i / EXTRACTED_CHUNK_SIZE) + 1
      const chunkKey = getExtractedChunkKey(chunkNumber)
      const chunkData = allExtractedTriplets.slice(i, i + EXTRACTED_CHUNK_SIZE)
      
      await storage.set(chunkKey, chunkData)
      newChunks.push(chunkKey)
    }

    // Mettre à jour l'index
    const newIndex: ExtractedTripletsIndex = {
      chunks: newChunks,
      totalCount: allExtractedTriplets.length,
      lastChunk: newChunks.length > 0 ? newChunks[newChunks.length - 1] : null
    }
    
    await saveExtractedTripletsIndex(newIndex)
    console.log('💾 Saved extracted triplets to chunks:', newChunks.length, 'chunks for', allExtractedTriplets.length, 'triplets')
  } catch (err) {
    console.error('❌ Failed to save extracted triplets to chunks:', err)
    throw err
  }
}

interface EchoesTabProps {
  expandedTriplet: { msgIndex: number; tripletIndex: number } | null
  setExpandedTriplet: (value: { msgIndex: number; tripletIndex: number } | null) => void
}

const EchoesTab = ({ expandedTriplet, setExpandedTriplet }: EchoesTabProps) => {
  // État pour les messages SofIA parsés
  const [parsedMessages, setParsedMessages] = useState<ParsedSofiaMessage[]>([])
  const [isLoadingMessages, setIsLoadingMessages] = useState(false)

  // Hooks pour la gestion des triplets on-chain
  const { triplets, isLoading, getTripletsCount, updateTripletToOnChain, addTriplet, refreshTriplets } = useOnChainTriplets()
  const { createTripleOnChain, isCreating, currentStep } = useCreateTripleOnChain()
  
  // Hook MetaMask Account Abstraction
  const { 
    isSnapInstalled, 
    isConnecting, 
    isBatchProcessing, 
    batchError,
    connectSnap, 
    createBatchTriplets 
  } = useMetaMaskAA()
  
  const [processingTripletId, setProcessingTripletId] = useState<string | null>(null)

  // État pour la sélection batch
  const [selectedTriplets, setSelectedTriplets] = useState<Set<string>>(new Set())
  const [batchMode, setBatchMode] = useState(false)

  // Filtrer et trier les triplets non publiés (atom-only) - plus récent en premier
  const unpublishedTriplets = triplets
    .filter(t => t.tripleStatus === 'atom-only')
    .sort((a, b) => b.timestamp - a.timestamp)
  
  const unpublishedCounts = {
    total: unpublishedTriplets.length,
    created: unpublishedTriplets.filter(t => t.source === 'created').length,
    existing: unpublishedTriplets.filter(t => t.source === 'existing').length,
  }

  // Charger les messages SofIA depuis le storage
  useEffect(() => {
    // First run migration if needed, then load messages
    migrateLegacyStorage().then(() => {
      loadSofiaMessages()
    })
  }, [])

  // Migration function for users with old storage format
  const migrateLegacyStorage = async () => {
    try {
      // Migrate legacy sofiaMessages
      const legacyMessages = await storage.get("sofiaMessages")
      if (legacyMessages && Array.isArray(legacyMessages) && legacyMessages.length > 0) {
        console.log("🔄 Migrating legacy sofiaMessages to chunked system...")
        
        let extractedTriplets = await loadAllExtractedTriplets()
        
        let migratedCount = 0
        for (const message of legacyMessages) {
          try {
            const parsed = parseSofiaMessage(message.content.text, message.created_at)
            if (parsed && parsed.triplets.length > 0) {
              const tripletWithSource = {
                ...parsed,
                sourceMessageId: `legacy_${message.created_at}`,
                extractedAt: Date.now()
              }
              extractedTriplets.push(tripletWithSource)
              migratedCount++
            }
          } catch (parseError) {
            console.error("❌ Failed to migrate legacy message:", parseError)
          }
        }
        
        if (migratedCount > 0) {
          await saveExtractedTripletsToChunks(extractedTriplets)
          console.log(`✅ Migrated ${migratedCount} legacy triplets to chunks`)
        }
        
        // Remove legacy storage after successful migration
        await storage.remove("sofiaMessages")
        console.log("✅ Legacy sofiaMessages cleaned up")
      }

      // Migrate old extractedTriplets to chunked system
      const oldExtractedTriplets = await storage.get("extractedTriplets")
      if (oldExtractedTriplets && Array.isArray(oldExtractedTriplets) && oldExtractedTriplets.length > 0) {
        console.log("🔄 Migrating old extractedTriplets to chunked system...")
        
        await saveExtractedTripletsToChunks(oldExtractedTriplets)
        await storage.remove("extractedTriplets")
        console.log(`✅ Migrated ${oldExtractedTriplets.length} extracted triplets to chunked system`)
      }
    } catch (error) {
      console.error("❌ Migration failed:", error)
    }
  }

  const loadSofiaMessages = async () => {
    setIsLoadingMessages(true)
    try {
      // First, try to process any pending messages from buffer
      await processMessageBuffer()
      
      // Then load already parsed triplets from chunked storage
      const extractedTriplets = await loadAllExtractedTriplets()
      setParsedMessages(extractedTriplets)
      console.log("✅ Loaded extracted triplets from chunks:", extractedTriplets.length)
    } catch (error) {
      console.error('❌ Failed to load SofIA messages:', error)
      setParsedMessages([])
    } finally {
      setIsLoadingMessages(false)
    }
  }

  // NEW: Process messages from buffer and extract triplets safely
  const processMessageBuffer = async () => {
    try {
      const messageBuffer = await storage.get("sofiaMessagesBuffer") || []
      if (!Array.isArray(messageBuffer) || messageBuffer.length === 0) {
        console.log("📭 No messages in buffer to process")
        return
      }

      console.log(`🔄 Processing ${messageBuffer.length} messages from buffer`)
      
      // Get existing extracted triplets from chunks
      let extractedTriplets = await loadAllExtractedTriplets()

      const processedMessageIds: string[] = []
      let newTripletsCount = 0

      for (const message of messageBuffer) {
        if (message.processed) continue // Skip already processed messages

        try {
          console.log(`🔄 Processing message ${message.id}`)
          const parsed = parseSofiaMessage(message.content.text, message.created_at)
          
          if (parsed && parsed.triplets.length > 0) {
            // Add to extracted triplets with source tracking
            const tripletWithSource = {
              ...parsed,
              sourceMessageId: message.id,
              extractedAt: Date.now()
            }
            extractedTriplets.push(tripletWithSource)
            newTripletsCount++
            console.log(`✅ Extracted ${parsed.triplets.length} triplets from message ${message.id}`)
          }
          
          // Mark message as processed
          processedMessageIds.push(message.id)
        } catch (parseError) {
          console.error(`❌ Failed to parse message ${message.id}:`, parseError)
          // Don't mark as processed if parsing failed - retry next time
        }
      }

      // Save extracted triplets if we have new ones
      if (newTripletsCount > 0) {
        // Keep only the 100 most recent triplets to prevent storage bloat
        if (extractedTriplets.length > 100) {

          
          extractedTriplets = extractedTriplets
            .sort((a, b) => (b.extractedAt || b.created_at) - (a.extractedAt || a.created_at))
            .slice(0, 100)
        }
        
        await saveExtractedTripletsToChunks(extractedTriplets)
        console.log(`✅ Saved ${newTripletsCount} new triplets to chunked storage`)
      }

      // SAFELY remove processed messages from buffer
      if (processedMessageIds.length > 0) {
        const updatedBuffer = messageBuffer.filter(msg => !processedMessageIds.includes(msg.id))
        await storage.set("sofiaMessagesBuffer", updatedBuffer)
        console.log(`🧹 Removed ${processedMessageIds.length} processed messages from buffer`)
      }

    } catch (error) {
      console.error('❌ Failed to process message buffer:', error)
      if (error instanceof Error && error.message.includes('quota')) {
        console.log("🚨 Storage quota exceeded during processing, clearing buffer...")
        try {
          await storage.set("sofiaMessagesBuffer", [])
        } catch (clearError) {
          console.error("❌ Failed to clear buffer:", clearError)
        }
      }
    }
  }


  // Fonction pour importer un triplet SofIA vers les triplets on-chain
  const importTripletFromSofia = async (
    triplet: Triplet, 
    message: ParsedSofiaMessage,
    msgIndex: number,
    tripletIndex: number
  ) => {
    try {
      // Vérifier si ce triplet est déjà importé
      const isAlreadyImported = triplets.some(existing => 
        existing.triplet.subject === triplet.subject &&
        existing.triplet.predicate === triplet.predicate &&
        existing.triplet.object === triplet.object
      )

      if (isAlreadyImported) {
        console.log('⚠️ Triplet already imported, skipping')
        return
      }

      console.log("📥 Importing triplet from SofIA:", triplet)

      await addTriplet({
        triplet: triplet,
        atomVaultId: 'pending', // Sera rempli lors de la création complète
        source: 'created', 
        url: message.rawObjectUrl || '',
        ipfsUri: 'pending', // Sera rempli lors de la création complète
        originalMessage: {
          rawObjectDescription: message.rawObjectDescription,
          rawObjectUrl: message.rawObjectUrl
        },
        tripleStatus: 'atom-only' // Commence comme atom-only
      })

      console.log("✅ Triplet imported successfully")
    } catch (error) {
      console.error("❌ Failed to import triplet:", error)
      throw error
    }
  }

  // Fonction pour créer un triplet complet on-chain
  const handleCreateTripleOnChain = async (triplet: OnChainTriplet) => {
    if (isCreating || processingTripletId) {
      console.warn('Triple creation already in progress')
      return
    }

    setProcessingTripletId(triplet.id)
    
    try {
      console.log('🔗 Creating triple on-chain for:', triplet.triplet)
      
      const result = await createTripleOnChain(
        triplet.triplet.predicate,
        {
          name: triplet.triplet.object,
          description: triplet.originalMessage?.rawObjectDescription || "Content visited by the user.",
          url: triplet.url
        }
      )

      // Mettre à jour le triplet dans le storage
      await updateTripletToOnChain(
        triplet.id,
        result.tripleVaultId,
        result.subjectVaultId,
        result.predicateVaultId,
        result.objectVaultId,
        result.txHash
      )

      console.log('✅ Triple successfully created on-chain!', result)
    } catch (error) {
      console.error('❌ Failed to create triple on-chain:', error)
      alert(`Error creating triplet: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setProcessingTripletId(null)
    }
  }

  const handleViewOnExplorer = (txHash?: string, vaultId?: string) => {
    if (txHash) {
      window.open(`https://sepolia.basescan.org/tx/${txHash}`, '_blank')
    } else if (vaultId) {
      console.log('🔍 View vault:', vaultId)
    }
  }

  // Fonctions pour la sélection batch
  const toggleTripletSelection = (tripletId: string) => {
    const newSelected = new Set(selectedTriplets)
    if (newSelected.has(tripletId)) {
      newSelected.delete(tripletId)
    } else {
      newSelected.add(tripletId)
    }
    setSelectedTriplets(newSelected)
  }

  const selectAllPendingTriplets = () => {
    const allPendingIds = new Set(unpublishedTriplets.map(t => t.id))
    setSelectedTriplets(allPendingIds)
  }

  const clearSelection = () => {
    setSelectedTriplets(new Set())
  }

  // Fonction batch avec MetaMask AA
  const handleBatchCreate = async () => {
    if (selectedTriplets.size === 0) return

    console.log(`🚀🚀🚀 DÉBUT BATCH CRÉATION 🚀🚀🚀`)
    console.log(`📊 État initial:`)
    console.log(`  - selectedTriplets.size: ${selectedTriplets.size}`)
    console.log(`  - unpublishedTriplets.length: ${unpublishedTriplets.length}`)
    console.log(`  - selectedTriplets IDs:`, Array.from(selectedTriplets))
    console.log(`  - unpublishedTriplets IDs:`, unpublishedTriplets.map(t => t.id))

    try {
      // Vérifier si le Snap est installé
      if (!isSnapInstalled) {
        const connected = await connectSnap()
        if (!connected) return
      }

      // Préparer les triplets sélectionnés
      console.log(`🔍 ÉTAPE 1: Filtrage des triplets sélectionnés`)
      const selectedTripletsData = unpublishedTriplets
        .filter(t => {
          const isSelected = selectedTriplets.has(t.id)
          console.log(`  - Triplet ${t.id} (${t.triplet.subject}): ${isSelected ? 'SÉLECTIONNÉ' : 'non sélectionné'}`)
          return isSelected
        })
        .map(t => ({
          subject: t.triplet.subject,
          predicate: t.triplet.predicate,
          object: t.triplet.object,
          subjectId: 0, // Sera calculé dans le hook
          predicateId: 0,
          objectId: 0
        }))

      console.log(`✅ ÉTAPE 1 TERMINÉE: ${selectedTripletsData.length} triplets filtrés`)
      console.log(`📋 Triplets data:`, selectedTripletsData.map(t => `${t.subject} → ${t.predicate} → ${t.object}`))

      if (selectedTripletsData.length === 0) {
        console.error(`❌ ERREUR: Aucun triplet trouvé après filtrage !`)
        console.error(`❌ selectedTriplets:`, Array.from(selectedTriplets))
        console.error(`❌ unpublishedTriplets:`, unpublishedTriplets.map(t => `${t.id}: ${t.triplet.subject}`))
        return
      }

      // Créer le batch via MetaMask Snap
      console.log(`🔥 ÉTAPE 2: Appel createBatchTriplets avec ${selectedTripletsData.length} triplets`)
      const result = await createBatchTriplets(selectedTripletsData)

      console.log(`🎯 ÉTAPE 2 TERMINÉE: result.success = ${result.success}`)
      if (result.success) {
        console.log(`✅ Batch créé avec succès! UserOp: ${result.userOpHash}`)
        
        // Marquer TOUS les triplets sélectionnés comme créés
        console.log(`🔄 ÉTAPE 3: DÉBUT mise à jour de ${selectedTriplets.size} triplets dans le storage`)
        console.log(`🔄 IDs à traiter:`, Array.from(selectedTriplets))
        
        // COPIE IMMÉDIATE de selectedTriplets pour éviter les modifications concurrentes
        const tripletsToProcess = Array.from(selectedTriplets)
        console.log(`🔄 Copie des IDs à traiter:`, tripletsToProcess)
        
        let processedCount = 0
        console.log(`🔥 BOUCLE COMMENCE - ${tripletsToProcess.length} triplets à traiter`)
        
        for (let i = 0; i < tripletsToProcess.length; i++) {
          const tripletId = tripletsToProcess[i]
          console.log(`🔄 [${i + 1}/${tripletsToProcess.length}] ===== DÉBUT TRAITEMENT triplet ID: ${tripletId} =====`)
          
          // VÉRIFIER si unpublishedTriplets a changé pendant la boucle
          console.log(`🔄 [${i + 1}/${tripletsToProcess.length}] unpublishedTriplets.length actuel: ${unpublishedTriplets.length}`)
          
          const triplet = unpublishedTriplets.find(t => t.id === tripletId)
          if (triplet) {
            console.log(`  ✅ [${i + 1}/${tripletsToProcess.length}] TROUVÉ - Triplet: ${triplet.triplet.subject} → ${triplet.triplet.predicate} → ${triplet.triplet.object}`)
            console.log(`  🔄 [${i + 1}/${tripletsToProcess.length}] État avant updateTripletToOnChain: tripleStatus = ${triplet.tripleStatus}`)
            
            try {
              console.log(`  🚀 [${i + 1}/${tripletsToProcess.length}] APPEL updateTripletToOnChain pour ${triplet.id}`)
              console.log(`  🚀 [${i + 1}/${tripletsToProcess.length}] Paramètres: userOpHash=${result.userOpHash}`)
              
              await updateTripletToOnChain(
                triplet.id,
                result.userOpHash, // Utiliser userOpHash comme tripleVaultId temporaire
                'batch-created',
                'batch-created', 
                'batch-created',
                result.userOpHash
              )
              processedCount++
              console.log(`  ✅ [${i + 1}/${tripletsToProcess.length}] SUCCÈS - Triplet ${triplet.id} marqué comme créé (total: ${processedCount})`)
              
              // Vérifier l'état après la mise à jour
              const updatedTriplet = unpublishedTriplets.find(t => t.id === tripletId)
              if (updatedTriplet) {
                console.log(`  📊 [${i + 1}/${tripletsToProcess.length}] État après update: tripleStatus = ${updatedTriplet.tripleStatus}`)
              } else {
                console.log(`  📊 [${i + 1}/${tripletsToProcess.length}] Triplet introuvable après update (normal si maintenant on-chain)`)
              }
              
            } catch (updateError) {
              console.error(`  ❌ [${i + 1}/${tripletsToProcess.length}] ERREUR mise à jour triplet ${triplet.id}:`, updateError)
              console.error(`  ❌ [${i + 1}/${tripletsToProcess.length}] Stack trace:`, updateError.stack)
              // CONTINUER la boucle même en cas d'erreur
            }
          } else {
            console.warn(`  ⚠️ [${i + 1}/${tripletsToProcess.length}] NON TROUVÉ - Triplet ID: ${tripletId}`)
            console.warn(`  📋 [${i + 1}/${tripletsToProcess.length}] unpublishedTriplets actuels:`, unpublishedTriplets.map(t => `${t.id}: ${t.triplet.subject} (${t.tripleStatus})`))
          }
          
          console.log(`🔄 [${i + 1}/${tripletsToProcess.length}] ===== FIN TRAITEMENT triplet ${tripletId} =====`)
        }
        
        console.log(`🔥 BOUCLE TERMINÉE - ${processedCount}/${tripletsToProcess.length} triplets traités`)
        
        console.log(`🎉 ÉTAPE 3 TERMINÉE: ${processedCount}/${tripletsToProcess.length} triplets traités avec succès!`)

        // Forcer rafraîchissement des triplets
        console.log(`🔄 ÉTAPE 4: Rafraîchissement forcé des triplets`)
        await refreshTriplets()
        
        // Attendre un peu pour que React mette à jour l'état
        await new Promise(resolve => setTimeout(resolve, 100))
        
        console.log(`✅ ÉTAPE 4 TERMINÉE: Triplets rafraîchis`)
        
        // Force un re-render en attendant que l'état React se mette à jour
        await new Promise(resolve => setTimeout(resolve, 200))
        
        console.log(`📊 État final des triplets traités (après délai):`)
        for (const tripletId of tripletsToProcess) {
          const finalTriplet = triplets.find(t => t.id === tripletId)
          if (finalTriplet) {
            console.log(`  - ${tripletId}: ${finalTriplet.tripleStatus} (${finalTriplet.triplet.subject})`)
          } else {
            console.log(`  - ${tripletId}: NON TROUVÉ`)
          }
        }
        
        // Vérifier combien de triplets restent unpublished après le batch
        const remainingUnpublished = triplets.filter(t => t.tripleStatus === 'atom-only')
        console.log(`📊 Triplets unpublished restants: ${remainingUnpublished.length}`)
        console.log(`📊 Triplets on-chain: ${triplets.filter(t => t.tripleStatus === 'on-chain').length}`)

        // Nettoyer la sélection
        console.log(`🧹 ÉTAPE 5: Nettoyage sélection et batch mode`)
        setSelectedTriplets(new Set())
        setBatchMode(false)
        console.log(`✅ ÉTAPE 5 TERMINÉE: Sélection nettoyée`)
      } else {
        console.error(`❌ Batch failed:`, result.error)
      }
    } catch (error) {
      console.error('❌ ERREUR GÉNÉRALE batch creation:', error)
    }
    
    console.log(`🏁🏁🏁 FIN BATCH CRÉATION 🏁🏁🏁`)
  }

  // Fonction pour importer tous les triplets disponibles
  const importAllAvailableTriplets = async () => {
    try {
      let importCount = 0
      
      for (const [msgIndex, message] of parsedMessages.entries()) {
        if (message.triplets.length > 0) {
          for (const [tripletIndex, triplet] of message.triplets.entries()) {
            // Vérifier si déjà importé
            const isAlreadyImported = triplets.some(existing => 
              existing.triplet.subject === triplet.subject &&
              existing.triplet.predicate === triplet.predicate &&
              existing.triplet.object === triplet.object
            )

            if (!isAlreadyImported) {
              await importTripletFromSofia(triplet, message, msgIndex, tripletIndex)
              importCount++
            }
          }
        }
      }

      console.log(`✅ Imported ${importCount} new triplets!`)
      if (importCount === 0) {
        alert("All triplets are already imported!")
      }
    } catch (error) {
      console.error('❌ Failed to import triplets:', error)
      
      // Si erreur de quota, suggérer le nettoyage
      if (error instanceof Error && error.message.includes('quota')) {
        const shouldClean = confirm("Storage quota error! Do you want to clean old messages to free up space?")
        if (shouldClean) {
          await clearOldMessages()
          // Retry l'import après nettoyage
          await importAllAvailableTriplets()
        }
      } else {
        alert(`Import error: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }
    }
  }

  // Fonction pour nettoyer les anciens messages manuellement
  const clearOldMessages = async () => {
    try {
      console.log("🧹 Manual cleanup initiated...")
      
      // Clear buffer completely
      await storage.set("sofiaMessagesBuffer", [])
      console.log("✅ Cleared message buffer")
      
      // Keep only the 10 most recent extracted triplets (reduced for chunked system)
      const extractedTriplets = await loadAllExtractedTriplets()
      if (extractedTriplets.length > 0) {
        const recentTriplets = extractedTriplets
          .sort((a, b) => (b.extractedAt || b.created_at) - (a.extractedAt || a.created_at))
          .slice(0, 10)
        
        await saveExtractedTripletsToChunks(recentTriplets)
        console.log(`✅ Cleaned triplets: kept ${recentTriplets.length} most recent in chunks`)
      }
      
      // Clear old storage formats if they still exist (migration cleanup)
      try {
        await storage.remove("sofiaMessages")
        await storage.remove("extractedTriplets")
        console.log("✅ Removed legacy storage keys")
      } catch (removeError) {
        // Ignore if already removed
      }
      
      // Reload messages after cleanup
      await loadSofiaMessages()
    } catch (error) {
      console.error('❌ Failed to clean messages:', error)
    }
  }


  const getBorderStyle = (source: 'created' | 'existing') => {
    return source === 'created' 
      ? 'border-green' 
      : 'border-blue'
  }

  // Calculer les triplets disponibles pour import
  const availableTripletsCount = parsedMessages.reduce((count, message) => {
    return count + message.triplets.filter(triplet => {
      return !triplets.some(existing => 
        existing.triplet.subject === triplet.subject &&
        existing.triplet.predicate === triplet.predicate &&
        existing.triplet.object === triplet.object
      )
    }).length
  }, 0)

  if (isLoadingMessages || isLoading) {
    return (
      <div className="triples-container">
        <div className="empty-state">
          <p>Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="triples-container">
      {/* Section d'import des triplets SofIA */}
      {availableTripletsCount > 0 && (
        <div className="import-section">
          <div className="import-header">
            <h3> Echoes ({availableTripletsCount})</h3>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button 
                className="btn-secondary"
                onClick={importAllAvailableTriplets}
                disabled={isCreating}
                style={{ fontSize: '12px', padding: '8px 12px' }}
              >
                Listen
              </button>
              <button 
                className="btn-secondary"
                onClick={clearOldMessages}
                title="Clean old messages to free up space"
                style={{ fontSize: '12px', padding: '8px 12px' }}
              >
                Ignore
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Batch Selection Interface */}
      {unpublishedCounts.total > 0 && (
        <div className="batch-selection-section">
          <div className="batch-header">
            <div className="batch-toggle">
              <label>
                <input
                  type="checkbox"
                  checked={batchMode}
                  onChange={(e) => setBatchMode(e.target.checked)}
                />
                <span>🚀 Batch Mode (Account Abstraction)</span>
              </label>
            </div>
            
            {batchMode && (
              <div className="batch-controls">
                <button 
                  className="btn-secondary"
                  onClick={selectAllPendingTriplets}
                  disabled={unpublishedCounts.total === 0}
                >
                  Select All ({unpublishedCounts.total})
                </button>
                <button 
                  className="btn-secondary"
                  onClick={clearSelection}
                  disabled={selectedTriplets.size === 0}
                >
                  Clear
                </button>
                
                {!isSnapInstalled && (
                  <button 
                    className="btn-primary"
                    onClick={connectSnap}
                    disabled={isConnecting}
                  >
                    {isConnecting ? 'Installing...' : '🔌 Install MetaMask Snap'}
                  </button>
                )}
                
                {isSnapInstalled && (
                  <button 
                    className="btn-primary batch-create-btn"
                    onClick={handleBatchCreate}
                    disabled={selectedTriplets.size === 0 || isBatchProcessing}
                  >
                    {isBatchProcessing ? (
                      <>⏳ Creating {selectedTriplets.size} triplets...</>
                    ) : (
                      <>🚀 Create {selectedTriplets.size} triplets (1 signature)</>
                    )}
                  </button>
                )}
              </div>
            )}
            
            {batchMode && selectedTriplets.size > 0 && (
              <div className="batch-stats">
                ✅ {selectedTriplets.size} triplets selected for batch creation
              </div>
            )}
            
            {batchError && (
              <div className="batch-error">
                ❌ {batchError}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Stats header */}
      {unpublishedCounts.total > 0 && (
        <div className="signals-stats">
          <div className="stat-item">
            <span className="stat-number stat-atom-only">{unpublishedCounts.total}</span>
            <span className="stat-label">Pending</span>
          </div>
          <div className="stat-item">
            <span className="stat-number stat-created">{unpublishedCounts.created}</span>
            <span className="stat-label">Created</span>
          </div>
          <div className="stat-item">
            <span className="stat-number stat-existing">{unpublishedCounts.existing}</span>
            <span className="stat-label">Existing</span>
          </div>
        </div>
      )}

      {/* Liste des triplets en attente de publication */}
      {unpublishedTriplets.length > 0 ? (
        unpublishedTriplets.map((tripletItem, tripletItemIndex) => {
          // Pour le moment, on utilise l'index du triplet comme identifiant
          const isExpanded = expandedTriplet?.msgIndex === 0 && expandedTriplet?.tripletIndex === tripletItemIndex
          const isSelected = selectedTriplets.has(tripletItem.id)

          return (
            <div key={tripletItem.id} className={`echo-card ${getBorderStyle(tripletItem.source)} ${isSelected ? 'selected' : ''}`}>
              <div className={`triplet-item ${isExpanded ? 'expanded' : ''}`}>
                
                {/* Checkbox pour sélection batch */}
                {batchMode && (
                  <div className="triplet-checkbox">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleTripletSelection(tripletItem.id)}
                    />
                  </div>
                )}
          

                {/* Texte du triplet */}
                <p
                  className="triplet-text clickable"
                  onClick={() => {
                    // Utiliser l'index du triplet pour l'expansion
                    const newExpandedState = isExpanded ? null : { 
                      msgIndex: 0, // Toujours 0 car on gère maintenant depuis le storage unifié
                      tripletIndex: tripletItemIndex
                    }
                    setExpandedTriplet(newExpandedState)
                  }}
                >
                  <span className="subject">{tripletItem.triplet.subject}</span>{' '}
                  <span className="action">{tripletItem.triplet.predicate}</span>{' '}
                  <span className="object">{tripletItem.triplet.object}</span>
                </p>

                {/* Header avec badges et actions */}
                <div className="triplet-header">
                  <div className="signal-actions">
                    {!batchMode && (
                      <QuickActionButton
                        action="amplify"
                        onClick={() => handleCreateTripleOnChain(tripletItem)}
                        disabled={processingTripletId === tripletItem.id || isCreating}
                      />
                    )}
                  </div>
                </div>
                {/* Message de progression */}
                {processingTripletId === tripletItem.id && (
                  <div className="processing-message">
                    {currentStep || '⚙️ Creating triplet...'}
                  </div>
                )}

                {isExpanded && (
                  <div className="triplet-details">
                    <div className="triplet-detail-section">
                      <h4 className="triplet-detail-title">🧍 Subject</h4>
                      <p className="triplet-detail-name">{tripletItem.triplet.subject}</p>
                    </div>

                    <div className="triplet-detail-section">
                      <h4 className="triplet-detail-title">🔗 Predicate</h4>
                      <p className="triplet-detail-name">{tripletItem.triplet.predicate}</p>
                    </div>

                    <div className="triplet-detail-section">
                      <h4 className="triplet-detail-title">📄 Object</h4>
                      <p className="triplet-detail-name">{tripletItem.triplet.object}</p>
                    </div>

                    <div className="triplet-detail-section">
                      <h4 className="triplet-detail-title">⛓️ Blockchain</h4>
                      <p className="triplet-detail-name">Object VaultID: {tripletItem.atomVaultId}</p>
                      {tripletItem.tripleVaultId && (
                        <p className="triplet-detail-name">Triple VaultID: {tripletItem.tripleVaultId}</p>
                      )}
                      {tripletItem.subjectVaultId && (
                        <p className="triplet-detail-name">Subject VaultID: {tripletItem.subjectVaultId}</p>
                      )}
                      {tripletItem.predicateVaultId && (
                        <p className="triplet-detail-name">Predicate VaultID: {tripletItem.predicateVaultId}</p>
                      )}
                      {tripletItem.txHash && (
                        <p className="triplet-detail-name">
                          TX: {tripletItem.txHash.slice(0, 10)}...{tripletItem.txHash.slice(-8)}
                        </p>
                      )}
                      <p className="triplet-detail-name">
                        📦 IPFS: {tripletItem.ipfsUri.slice(0, 20)}...
                      </p>
                      <p className="triplet-detail-name">
                        Status: 🔗 Pending publication
                      </p>
                    </div>

                    <div className="triplet-detail-section">
                      <h4 className="triplet-detail-title">🌐 Source</h4>
                      <p className="triplet-detail-name">{tripletItem.url}</p>
                      <p className="triplet-detail-timestamp">
                        {new Date(tripletItem.timestamp).toLocaleString()}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )
        })
      ) : availableTripletsCount > 0 ? (
        <div className="empty-state">
          <p>No pending triplets</p>
          <p className="empty-subtext">
            Click "Import all triplets" above to get started
          </p>
        </div>
      ) : parsedMessages.length > 0 ? (
        <div className="empty-state">
          <p>All your triplets are already published!</p>
          <p className="empty-subtext">
            Check the Signals tab to view your published triplets
          </p>
        </div>
      ) : (
        <div className="empty-state">
          <p>No SofIA messages found</p>
          <p className="empty-subtext">
            Your triplets will appear automatically when you receive messages
          </p>
          <button 
            className="btn-secondary"
            onClick={clearOldMessages}
            style={{ marginTop: '16px' }}
          >
            🧹 Clean storage
          </button>
        </div>
      )}
    </div>
  )
}

export default EchoesTab