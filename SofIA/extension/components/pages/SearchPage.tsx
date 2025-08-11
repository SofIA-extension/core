import React from 'react'
import { useRouter } from '../layout/RouterProvider'
import { useMCPClient } from '../../hooks/useMCPClient'
import { useCurrentSearch } from '../../hooks/useSearchHistory'
import '../styles/Global.css'
import '../styles/CommonPage.css'

const SearchPage = () => {
  const { navigateTo } = useRouter()
  const { isReady, isLoading, error } = useMCPClient()
  const { currentQuery: searchQuery, setCurrentQuery: setSearchQuery, submitSearch } = useCurrentSearch()

  const handleSearch = async () => {
    if (searchQuery.trim() && isReady) {
      await submitSearch(searchQuery.trim())
      navigateTo('search-result')
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch()
    }
  }

  return (
    <div className="page">
      <button 
        onClick={() => navigateTo('home-connected')}
        className="back-button"
      >
        ← Back to Home
      </button>
    
      <div className="page-content">
        <input
          type="text"
          placeholder="Search in Intuition blockchain..."
          className="search-input"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button 
          onClick={handleSearch}
          className="search-button"
          disabled={!searchQuery.trim() || !isReady}
        >
          {isLoading ? 'Initializing...' : 'Search in Intuition'}
        </button>
        
        {error && (
          <div className="error-state">
            Connection error: {error}
          </div>
        )}
        
      </div>
    </div>
  )
}


export default SearchPage