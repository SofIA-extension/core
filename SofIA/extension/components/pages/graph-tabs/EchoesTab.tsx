import { useState, useEffect } from 'react'
import { useElizaData } from '../../../hooks/useElizaData'
import { elizaDataService } from '../../../lib/indexedDB-methods'
import { useCreateTripleOnChain } from '../../../hooks/useCreateTripleOnChain'
import { useCheckExistingTriple } from '../../../hooks/useCheckExistingTriple'
import { useCheckExistingAtom } from '../../../hooks/useCheckExistingAtom'
import { useGetExistingAtoms } from '../../../hooks/useGetExistingAtoms'
import QuickActionButton from '../../ui/QuickActionButton'
import type { Message, ParsedSofiaMessage, Triplet } from './types'
import { parseSofiaMessage } from './types'
import '../../styles/AtomCreationModal.css'
import '../../styles/MyGraphPage.css'

interface EchoesTabProps {
  expandedTriplet: { msgIndex: number; tripletIndex: number } | null
  setExpandedTriplet: (value: { msgIndex: number; tripletIndex: number } | null) => void
}

// Interface pour les triplets locaux à EchoesTab
interface EchoTriplet {
  id: string
  triplet: {
    subject: string
    predicate: string
    object: string
  }
  url: string
  description: string
  timestamp: number
  sourceMessageId: string
  status: 'available' | 'checking' | 'ready' | 'published' | 'exists_on_chain'
  // Blockchain data (filled after checks)
  subjectVaultId?: string
  predicateVaultId?: string
  objectVaultId?: string
  tripleVaultId?: string
  txHash?: string
  onChainStatus?: 'created' | 'existing'
}

const EchoesTab = ({ expandedTriplet, setExpandedTriplet }: EchoesTabProps) => {
  // État local à EchoesTab
  const [echoTriplets, setEchoTriplets] = useState<EchoTriplet[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [processingTripletId, setProcessingTripletId] = useState<string | null>(null)

  // Hook IndexedDB pour les messages Eliza (lecture seule)
  const { 
    messages: rawMessages, 
    isLoading: isLoadingEliza, 
    refreshMessages 
  } = useElizaData({ autoRefresh: true, refreshInterval: 5000 })

  // Hooks blockchain pour la vérification et création
  const { createTripleOnChain, isCreating, currentStep } = useCreateTripleOnChain()
  const { checkTripleExists } = useCheckExistingTriple()
  const { checkAndCreateAtom } = useCheckExistingAtom()
  const { getAtomByIpfsUri } = useGetExistingAtoms()

  // Charger les états sauvegardés puis traiter les messages
  useEffect(() => {
    loadSavedStatesAndProcess()
  }, [rawMessages])

  // Sauvegarder les états quand ils changent (éviter boucle infinie)
  useEffect(() => {
    if (echoTriplets.length > 0) {
      // Débounce pour éviter les sauvegardes trop fréquentes
      const timeoutId = setTimeout(() => {
        saveTripletStates()
      }, 500)
      
      return () => clearTimeout(timeoutId)
    }
  }, [echoTriplets])

  const processRawMessages = async (savedStates?: EchoTriplet[]) => {
    try {
      console.log(`🔍 EchoesTab: Processing ${rawMessages.length} raw messages${savedStates ? ' with saved states' : ''}`)
      const newEchoTriplets: EchoTriplet[] = []
      
      for (const record of rawMessages) {
        if (record.type === 'message' && record.content) {
          const message = record.content as Message
          
          try {
            const parsed = parseSofiaMessage(message.content.text, message.created_at)
            
            if (parsed && parsed.triplets.length > 0) {
              parsed.triplets.forEach((triplet, index) => {
                const tripletId = `${record.messageId}_${index}`
                
                // Vérifier dans les états sauvegardés d'abord, puis dans l'état actuel
                const existingTriplet = savedStates?.find(t => t.id === tripletId) || 
                                     echoTriplets.find(t => t.id === tripletId)
                
                if (existingTriplet && (existingTriplet.status === 'ready' || existingTriplet.status === 'published' || existingTriplet.status === 'exists_on_chain')) {
                  // Garder le triplet existant avec son statut avancé
                  newEchoTriplets.push(existingTriplet)
                  console.log(`🔒 EchoesTab: Preserving triplet ${tripletId} with status: ${existingTriplet.status}`)
                } else {
                  // Créer un nouveau triplet en statut 'available'
                  const echoTriplet: EchoTriplet = {
                    id: tripletId,
                    triplet: {
                      subject: triplet.subject,
                      predicate: triplet.predicate,
                      object: triplet.object
                    },
                    url: parsed.rawObjectUrl || '',
                    description: parsed.rawObjectDescription || parsed.intention,
                    timestamp: record.timestamp,
                    sourceMessageId: record.messageId,
                    status: 'available'
                  }
                  newEchoTriplets.push(echoTriplet)
                }
              })
              
              console.log(`✅ EchoesTab: Processed ${parsed.triplets.length} triplets from message ${record.messageId}`)
            }
          } catch (parseError) {
            console.error(`❌ EchoesTab: Failed to parse message ${record.messageId}:`, parseError)
          }
        }
      }
      
      setEchoTriplets(newEchoTriplets)
      console.log(`✅ EchoesTab: Processed ${newEchoTriplets.length} total triplets`)
      
    } catch (error) {
      console.error('❌ EchoesTab: Failed to process messages:', error)
    }
  }

  // Charger les états sauvegardés et traiter les messages  
  const loadSavedStatesAndProcess = async () => {
    try {
      const savedStates = await elizaDataService.loadTripletStates()
      
      if (savedStates.length > 0) {
        console.log(`💾 EchoesTab: Loading ${savedStates.length} saved triplet states`)
        setEchoTriplets(savedStates)
        await new Promise(resolve => setTimeout(resolve, 0))
      }
      
      // Utiliser la fonction unifiée avec ou sans états sauvegardés
      await processRawMessages(savedStates.length > 0 ? savedStates : undefined)
      
    } catch (error) {
      console.error('❌ EchoesTab: Failed to load saved states:', error)
      await processRawMessages()
    }
  }

  // Sauvegarder les états des triplets
  const saveTripletStates = async () => {
    try {
      await elizaDataService.storeTripletStates(echoTriplets)
    } catch (error) {
      console.error('❌ EchoesTab: Failed to save triplet states:', error)
    }
  }

  // Vérifier et préparer tous les triplets (créer atoms + vérifier existence)
  const checkAndPrepareAllTriplets = async () => {
    setIsProcessing(true)
    try {
      const availableTriplets = echoTriplets.filter(t => t.status === 'available')
      
      if (availableTriplets.length === 0) {
        alert("No triplets available to check!")
        return
      }

      console.log(`🔍 EchoesTab: Checking ${availableTriplets.length} triplets...`)
      
      for (const triplet of availableTriplets) {
        try {
          // Marquer comme en cours de vérification
          setEchoTriplets(prev => 
            prev.map(t => t.id === triplet.id ? { ...t, status: 'checking' as const } : t)
          )

          console.log(`🔍 Checking triplet: ${triplet.triplet.subject} ${triplet.triplet.predicate} ${triplet.triplet.object}`)

          // 1. Créer/vérifier l'atom Object
          const objectAtom = await checkAndCreateAtom({
            name: triplet.triplet.object,
            description: triplet.description,
            url: triplet.url
          })
          
          console.log(`📄 Object atom: ${objectAtom.vaultId} (${objectAtom.source})`)

          // 2. Pour User et Predicate, on va utiliser la logique de useCreateTripleOnChain
          // qui gère automatiquement ces atoms
          // Donc on simule juste leur création pour avoir les IDs
          
          // Pour l'instant, marquer comme prêt
          setEchoTriplets(prev => 
            prev.map(t => t.id === triplet.id ? { 
              ...t, 
              status: 'ready' as const,
              objectVaultId: objectAtom.vaultId,
              onChainStatus: objectAtom.source
            } : t)
          )

          console.log(`✅ Triplet ${triplet.id} prepared and ready for publication`)

        } catch (error) {
          console.error(`❌ Failed to prepare triplet ${triplet.id}:`, error)
          // Remettre en available en cas d'erreur
          setEchoTriplets(prev => 
            prev.map(t => t.id === triplet.id ? { ...t, status: 'available' as const } : t)
          )
        }
      }

      console.log(`✅ EchoesTab: Finished checking all triplets`)
      
    } catch (error) {
      console.error('❌ EchoesTab: Check failed:', error)
      alert(`Check error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsProcessing(false)
    }
  }

  // Publier un triplet spécifique on-chain
  const publishTriplet = async (tripletId: string) => {
    const triplet = echoTriplets.find(t => t.id === tripletId)
    if (!triplet) return

    if (isCreating || processingTripletId) {
      console.warn('Triple creation already in progress')
      return
    }

    setProcessingTripletId(tripletId)
    
    try {
      console.log(`🔗 EchoesTab: Publishing triplet ${tripletId} on-chain`)
      
      const result = await createTripleOnChain(
        triplet.triplet.predicate,
        {
          name: triplet.triplet.object,
          description: triplet.description,
          url: triplet.url
        }
      )

      // Marquer comme publié avec toutes les infos blockchain
      setEchoTriplets(prev => 
        prev.map(t => t.id === tripletId ? { 
          ...t, 
          status: 'published' as const,
          tripleVaultId: result.tripleVaultId,
          subjectVaultId: result.subjectVaultId,
          predicateVaultId: result.predicateVaultId,
          objectVaultId: result.objectVaultId,
          txHash: result.txHash,
          onChainStatus: result.source
        } : t)
      )

      console.log(`✅ EchoesTab: Triplet ${tripletId} published successfully!`, result)
      
    } catch (error) {
      console.error(`❌ EchoesTab: Failed to publish triplet ${tripletId}:`, error)
      alert(`Publish error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setProcessingTripletId(null)
    }
  }

  // Nettoyer les anciens messages
  const clearOldMessages = async () => {
    try {
      console.log("🧹 EchoesTab: Manual cleanup initiated...")
      await elizaDataService.deleteOldMessages(7)
      await refreshMessages()
      console.log("✅ EchoesTab: Cleanup completed")
    } catch (error) {
      console.error('❌ EchoesTab: Cleanup failed:', error)
    }
  }

  const handleViewOnExplorer = (txHash?: string, vaultId?: string) => {
    if (txHash) {
      window.open(`https://sepolia.basescan.org/tx/${txHash}`, '_blank')
    } else if (vaultId) {
      console.log('🔍 View vault:', vaultId)
    }
  }

  // Statistiques des triplets
  const availableCount = echoTriplets.filter(t => t.status === 'available').length
  const checkingCount = echoTriplets.filter(t => t.status === 'checking').length
  const readyCount = echoTriplets.filter(t => t.status === 'ready').length
  const publishedCount = echoTriplets.filter(t => t.status === 'published').length
  const existsOnChainCount = echoTriplets.filter(t => t.status === 'exists_on_chain').length

  if (isLoadingEliza) {
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
      {/* Section d'actions principales */}
      {availableCount > 0 && (
        <div className="import-section">
          <div className="import-header">
            <h3>📡 Echoes ({availableCount})</h3>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button 
                className="btn-secondary"
                onClick={checkAndPrepareAllTriplets}
                disabled={isProcessing}
                style={{ fontSize: '12px', padding: '8px 12px' }}
              >
                {isProcessing ? 'Checking...' : 'Listen'}
              </button>
              <button 
                className="btn-secondary"
                onClick={clearOldMessages}
                title="Clean old messages"
                style={{ fontSize: '12px', padding: '8px 12px' }}
              >
                Ignore
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stats */}
      {echoTriplets.length > 0 && (
        <div className="signals-stats">
          <div className="stat-item">
            <span className="stat-number stat-atom-only">{availableCount}</span>
            <span className="stat-label">Available</span>
          </div>
          <div className="stat-item">
            <span className="stat-number stat-created">{readyCount}</span>
            <span className="stat-label">Ready</span>
          </div>
          <div className="stat-item">
            <span className="stat-number stat-existing">{publishedCount}</span>
            <span className="stat-label">Published</span>
          </div>
        </div>
      )}

      {/* Liste des triplets prêts pour publication */}
      {readyCount > 0 && (
        <div style={{ marginBottom: '20px' }}>
          <h4>🔗 Ready for Publication ({readyCount})</h4>
          {echoTriplets
            .filter(t => t.status === 'ready')
            .sort((a, b) => b.timestamp - a.timestamp)
            .map((tripletItem, index) => {
              const isExpanded = expandedTriplet?.msgIndex === 1 && expandedTriplet?.tripletIndex === index

              return (
                <div key={tripletItem.id} className="echo-card border-green">
                  <div className={`triplet-item ${isExpanded ? 'expanded' : ''}`}>
                    <p
                      className="triplet-text clickable"
                      onClick={() => {
                        setExpandedTriplet(isExpanded ? null : { msgIndex: 1, tripletIndex: index })
                      }}
                    >
                      <span className="subject">{tripletItem.triplet.subject}</span>{' '}
                      <span className="action">{tripletItem.triplet.predicate}</span>{' '}
                      <span className="object">{tripletItem.triplet.object}</span>
                    </p>

                    <div className="triplet-header">
                      <div className="signal-actions">
                        <QuickActionButton
                          action="amplify"
                          onClick={() => publishTriplet(tripletItem.id)}
                          disabled={processingTripletId === tripletItem.id || isCreating}
                        />
                      </div>
                    </div>

                    {processingTripletId === tripletItem.id && (
                      <div className="processing-message">
                        {currentStep || '⚙️ Publishing triplet...'}
                      </div>
                    )}

                    {isExpanded && (
                      <div className="triplet-details">
                        <div className="triplet-detail-section">
                          <h4 className="triplet-detail-title">⛓️ Blockchain Info</h4>
                          {tripletItem.objectVaultId && (
                            <p className="triplet-detail-name">Object VaultID: {tripletItem.objectVaultId}</p>
                          )}
                          <p className="triplet-detail-name">
                            Status: 🔗 Ready for publication
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
          }
        </div>
      )}

      {/* Liste des triplets publiés */}
      {publishedCount > 0 && (
        <div style={{ marginBottom: '20px' }}>
          <h4>✅ Published ({publishedCount})</h4>
          {echoTriplets
            .filter(t => t.status === 'published')
            .sort((a, b) => b.timestamp - a.timestamp)
            .map((tripletItem, index) => {
              const isExpanded = expandedTriplet?.msgIndex === 2 && expandedTriplet?.tripletIndex === index

              return (
                <div key={tripletItem.id} className="echo-card border-blue">
                  <div className={`triplet-item ${isExpanded ? 'expanded' : ''}`}>
                    <p
                      className="triplet-text clickable"
                      onClick={() => {
                        setExpandedTriplet(isExpanded ? null : { msgIndex: 2, tripletIndex: index })
                      }}
                    >
                      <span className="subject">{tripletItem.triplet.subject}</span>{' '}
                      <span className="action">{tripletItem.triplet.predicate}</span>{' '}
                      <span className="object">{tripletItem.triplet.object}</span>
                    </p>

                    <div className="triplet-header">
                      <div className="signal-actions">
                        <QuickActionButton
                          action="scan"
                          onClick={() => handleViewOnExplorer(tripletItem.txHash, tripletItem.tripleVaultId)}
                        />
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="triplet-details">
                        <div className="triplet-detail-section">
                          <h4 className="triplet-detail-title">⛓️ Blockchain</h4>
                          <p className="triplet-detail-name">Triple VaultID: {tripletItem.tripleVaultId}</p>
                          <p className="triplet-detail-name">Subject VaultID: {tripletItem.subjectVaultId}</p>
                          <p className="triplet-detail-name">Predicate VaultID: {tripletItem.predicateVaultId}</p>
                          <p className="triplet-detail-name">Object VaultID: {tripletItem.objectVaultId}</p>
                          {tripletItem.txHash && (
                            <p className="triplet-detail-name">
                              TX: {tripletItem.txHash.slice(0, 10)}...{tripletItem.txHash.slice(-8)}
                            </p>
                          )}
                          <p className="triplet-detail-name">
                            Status: ⛓️ Published on-chain
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
          }
        </div>
      )}

      {/* États vides */}
      {echoTriplets.length === 0 ? (
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
      ) : availableCount === 0 && readyCount === 0 && publishedCount === 0 ? (
        <div className="empty-state">
          <p>All your triplets are processed!</p>
          <p className="empty-subtext">
            Navigate to new pages to generate more triplets
          </p>
        </div>
      ) : availableCount === 0 && readyCount === 0 ? (
        <div className="empty-state">
          <p>All triplets are published!</p>
          <p className="empty-subtext">
            Check the Signals tab to view all your published triplets
          </p>
        </div>
      ) : null}
    </div>
  )
}

export default EchoesTab