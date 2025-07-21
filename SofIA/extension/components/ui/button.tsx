import { useState } from "react"

interface ButtonProps {
  variant?: "default" | "successOutline"
  onClick?: () => void
  children: React.ReactNode
  style?: React.CSSProperties
}

export const Button = ({
  variant = "default",
  onClick,
  children,
  style = {}
}: ButtonProps) => {
  const [isHovered, setIsHovered] = useState(false)

  const baseStyles: React.CSSProperties = {
    padding: "8px 16px",
    borderRadius: "6px",
    fontWeight: "500",
    fontSize: "14px",
    transition: "all 0.2s ease",
    cursor: "pointer",
    border: "none",
    outline: "none",
    ...style
  }

  const variants = {
    default: {
      backgroundColor: "#007bff",
      color: "white"
    },
    successOutline: {
      backgroundColor: "transparent",
      border: "2px solid #28a745",
      color: "#28a745"
    }
  }

  const hoverStyles =
    variant === "default"
      ? { backgroundColor: "#0056b3" }
      : { backgroundColor: "#28a745", color: "white" }

  const buttonStyle = {
    ...baseStyles,
    ...variants[variant],
    ...(isHovered ? hoverStyles : {})
  }

  return (
    <button
      onClick={onClick}
      style={buttonStyle}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {children}
    </button>
  )
}
