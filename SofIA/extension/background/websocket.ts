import { io, Socket } from "socket.io-client"
import { SOFIA_IDS } from "./constants"

let socket: Socket

function generateUUID(): string {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
        const r = (Math.random() * 16) | 0
        const v = c === "x" ? r : (r & 0x3) | 0x8
        return v.toString(16)
      })
}

export async function initializeWebSocket(): Promise<void> {
  const roomId = SOFIA_IDS.ROOM_ID
  const entityId = SOFIA_IDS.AUTHOR_ID

  socket = io("http://localhost:3000", {
    transports: ["websocket"],
    path: "/socket.io",
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: 5,
    timeout: 20000
  })

  socket.on("connect", () => {
    console.log("✅ Connected to Eliza, socket ID:", socket.id)

    // 1. JOIN ROOM (ROOM_JOINING)
    socket.emit("message", {
      type: 1,
      payload: {
        roomId: roomId,
        entityId: entityId
      }
    })
    console.log("📨 Sent room join for room:", roomId)

    // 2. Optionnel : envoie d’un message test après connexion
    setTimeout(() => {
      sendAgentMessage("Connexion établie depuis l'extension.")
    }, 1000)
  })

  // 3. Listen to incoming broadcasts
  socket.on("messageBroadcast", (data) => {
    console.log("📩 Received broadcast:", data)

    if (data.roomId === roomId || data.channelId === roomId) {
      console.log("✅ Message is for our room!")
      console.log("Sender:", data.senderName)
      console.log("Text:", data.text)
    } else {
      console.warn("❌ Message is for a different room:", data.roomId || data.channelId)
    }
  })

  // 4. Other events
  socket.on("messageComplete", (data) => {
    console.log("✅ Message complete:", data)
  })

  socket.on("connection_established", (data) => {
    console.log("🔗 connection_established:", data)
  })

  socket.on("error", (err) => {
    console.error("❌ WebSocket error:", err)
  })

  socket.on("disconnect", (reason) => {
    console.warn("🔌 Disconnected:", reason)
    setTimeout(initializeWebSocket, 5000)
  })

  socket.on("connect_error", (error) => {
    console.error("❌ Connection error:", error)
  })

  // Optional: log all events
  socket.onAny((event, ...args) => {
    console.log("📥 [WS EVENT]", event, args)
  })
}

/**
 * Envoi d’un message à l’agent Eliza
 */
export function sendAgentMessage(text: string): void {
  if (!socket?.connected) {
    console.warn("⚠️ Socket non connecté")
    return
  }

  const payload = {
    type: 2, // SEND_MESSAGE
    payload: {
      senderId: SOFIA_IDS.AUTHOR_ID,
      senderName: "Extension User",
      message: text,
      messageId: generateUUID(),
      roomId: SOFIA_IDS.ROOM_ID,
      channelId: SOFIA_IDS.CHANNEL_ID,
      serverId: SOFIA_IDS.SERVER_ID,
      source: "extension",
      attachments: [],
      metadata: {
        channelType: "DM",
        isDm: true,
        targetUserId: SOFIA_IDS.AGENT_ID
      }
    }
  }

  console.log("📤 Sending message:", payload)
  socket.emit("message", payload)
}
