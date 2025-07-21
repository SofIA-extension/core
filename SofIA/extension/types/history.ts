/**
 * Types for SOFIA history tracking system
 * DOM data capture, visit tracking, and session management
 */

// DOM data captured by content script
export interface DOMData {
  title: string;              // document.title
  keywords: string;           // <meta name="keywords">
  description: string;        // <meta name="description">
  ogType: string;            // <meta property="og:type">
  h1: string;                // <h1> main heading
  url: string;               // page URL
  timestamp: number;         // capture timestamp
  hasScrolled: boolean;      // scroll activity indicator
}

// Chrome history data (simplified)
export interface SimplifiedHistoryEntry {
  url: string;                // complete URL
  lastVisitTime: number;     // last visit timestamp from Chrome API
  visitCount: number;        // total visits from Chrome API
  timestamp: number;         // event timestamp at capture
  duration?: number;         // calculated time spent on page
}

// Combined DOM + History data for complete visit tracking
export interface CompleteVisitData {
  domData: DOMData;
  historyData: SimplifiedHistoryEntry;
  capturedAt: number;        // combined capture timestamp
}

// Session data for tracking user engagement
export interface SessionData {
  timestamp: number;
  duration: number;
  scrollEvents: number;
}

// Visit data with session tracking
export interface VisitData {
  url: string;
  title: string;
  keywords: string;
  description: string;
  ogType: string;
  h1: string;
  visitCount: number;
  lastVisitTime: number;
  firstVisitTime: number;
  totalDuration: number;
  sessions: SessionData[];
}

// Page metrics for analytics
export interface PageMetrics {
  url: string;
  title: string;
  keywords: string;
  description: string;
  ogType: string;
  h1: string;
  visitCount: number;
  lastVisitTime: number;
  timestamp: number;
  duration: number;
}

export interface BehaviorData {
  url: string;
  timestamp: number;
  videoPlayed?: boolean;
  videoDuration?: number;
  audioPlayed?: boolean;
  audioDuration?: number;
  articleRead?: boolean;
  title?: string;
  readTime?: number;
}
