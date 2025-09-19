"use client"

import { useState, useEffect } from "react"
import Image from "next/image"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Clock, CheckCircle, XCircle, Loader, Battery, BatteryLow, BatteryWarning, BatteryFull, Wifi, WifiOff, Activity } from "lucide-react"

// Simplified interfaces to match actual iOS data
interface Anchor {
  id: string           // UserSession.userId
  name: string         // UserSession.displayName or device name
  destination: string  // AnchorDestination (Window/Kitchen/Meeting Room)
  battery: number      // UIDevice.current.batteryLevel * 100
  status: "idle" | "active"
  connectedNavigators: number // Count of connected navigators
  qod?: number | null  // Quality of Distance score (0-100)
  navigatorDistances?: Array<{  // Distances to each navigator
    id: string
    name: string
    distance?: number
  }>
  anchorConnections?: Array<{    // Connections to ALL other anchors
    connectedTo: string   // Other anchor's destination name
    connectedToId: string // Other anchor's user ID
    peerId?: string       // Peer ID
    measuredDistance?: number
    expectedDistance?: number
    distanceError?: number
    percentError?: number
  }>
}

interface Navigator {
  id: string           // UserSession.userId
  name: string         // UserSession.displayName or device name
  targetAnchor: string // selectedAnchorName
  battery: number      // UIDevice.current.batteryLevel * 100
  status: "active" | "idle"
  connectedAnchors: number // connectedAnchors.count
  distances: {[anchorId: string]: number} // anchorDistances
  qod?: number | null  // Quality of Distance score (0-100)
}

// Keep SmartContract interface for mock data
interface SmartContract {
  txId: string
  robotId: string
  anchors: string[]
  anchorPhone?: string  // Added for anchor phone/destination
  asset: string
  price: number
  currency: "credits" | "USDC"
  status: "Pending" | "Executing" | "Settled" | "Failed"
  qodQuorum: "Pass" | "Fail"
  timestamp: Date
  dop: number
  minAnchors: number
  actualAnchors: number
  navigatorId: string
}

// API configuration - uses FastAPI server with Bonjour discovery
// No need for hardcoded IPs - devices are automatically discovered

// Ground truth distances between anchor destinations (in meters)
const GROUND_TRUTH_DISTANCES: {[key: string]: number} = {
  // A-B, A-C, A-D distances
  "A-B": 5.0,
  "B-A": 5.0,
  "A-C": 7.07,  // sqrt(5^2 + 5^2)
  "C-A": 7.07,
  "A-D": 5.0,
  "D-A": 5.0,
  
  // B-C, B-D distances
  "B-C": 5.0,
  "C-B": 5.0,
  "B-D": 7.07,  // sqrt(5^2 + 5^2)
  "D-B": 7.07,
  
  // C-D distance
  "C-D": 5.0,
  "D-C": 5.0,
}

// Helper function to calculate error on webapp side
function calculateError(measured: number, from: string, to: string): {error: number, percentError: number} | null {
  const key = `${from}-${to}`
  const expected = GROUND_TRUTH_DISTANCES[key]
  if (!expected) return null
  
  const error = measured - expected
  const percentError = (error / expected) * 100
  return { error, percentError }
}

// Mock contracts data (keeping as is)
const mockContracts: SmartContract[] = [
  {
    txId: "0xa7b2c9d4",
    navigatorId: "Akshata",
    anchors: ["Kitchen", "Meeting Room", "Window"],
    anchorPhone: "Kitchen",
    asset: "Pose attestation | 10s window",
    price: 12,
    currency: "USDC",
    status: "Settled" as const,
    qodQuorum: "Pass",
    timestamp: new Date(Date.now() - 45000),
    dop: 2.3,
    minAnchors: 3,
    actualAnchors: 3,
    robotId: "Akshata",
  },
  {
    txId: "0x3f8e1a6b",
    navigatorId: "Subha",
    anchors: ["Kitchen", "Window", "Meeting Room"],
    anchorPhone: "Window",
    asset: "Navigation proof | 30s window",
    price: 8,
    currency: "USDC",
    status: "Executing" as const,
    qodQuorum: "Pass",
    timestamp: new Date(Date.now() - 15000),
    dop: 2.1,
    minAnchors: 2,
    actualAnchors: 2,
    robotId: "Subha",
  },
]

function getStatusBadge(status: string) {
  if (status === "connected" || status === "active")
    return <Badge className="bg-green-100 text-green-800 border-green-200 px-3 py-1 text-sm font-medium">{status}</Badge>
  if (status === "error")
    return <Badge className="bg-red-100 text-red-800 border-red-200 px-3 py-1 text-sm font-medium">Unreachable</Badge>
  if (status === "offline")
    return <Badge className="bg-orange-100 text-orange-800 border-orange-200 px-3 py-1 text-sm font-medium">Offline</Badge>
  if (status === "stale")
    return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200 px-3 py-1 text-sm font-medium">Stale</Badge>
  return <Badge className="bg-gray-100 text-gray-800 border-gray-200 px-3 py-1 text-sm font-medium">{status}</Badge>
}

function getBatteryIcon(level?: number) {
  if (level === undefined) {
    return (
      <div className="flex items-center space-x-1">
        <div className="w-6 h-3 border border-gray-400 rounded-sm relative">
          <div className="absolute -right-0.5 top-0.5 w-0.5 h-2 bg-gray-400 rounded-r-sm"></div>
        </div>
      </div>
    );
  }
  
  // Determine color based on battery level (like iPhone)
  const getColor = (level: number) => {
    if (level <= 20) return "bg-red-500";      // Red for low battery
    if (level < 50) return "bg-yellow-500";    // Yellow for less than 50%
    return "bg-green-500";                     // Green for 50% and above
  };
  
  const color = getColor(level);
  const fillWidth = Math.max(0, Math.min(100, level)); // Ensure 0-100%
  
  return (
    <div className="flex items-center space-x-1">
      <div className="w-6 h-3 border border-gray-400 rounded-sm relative bg-white">
        <div 
          className={`h-full ${color} rounded-sm transition-all duration-300`}
          style={{ width: `${fillWidth}%` }}
        ></div>
        <div className="absolute -right-0.5 top-0.5 w-0.5 h-2 bg-gray-300 rounded-r-sm"></div>
      </div>
    </div>
  );
}

function getDistanceErrorBadge(error?: number | null) {
  if (error === undefined || error === null) return <Badge variant="outline" className="bg-gray-100 border-gray-300 text-gray-800">--</Badge>
  const absError = Math.abs(error)
  if (absError < 0.5)
    return <Badge className="bg-green-100 text-green-800">{error.toFixed(2)}m</Badge>
  if (absError < 1.0)
    return <Badge className="bg-amber-100 text-amber-800">{error.toFixed(2)}m</Badge>
  return <Badge className="bg-red-100 text-red-800">{error.toFixed(2)}m</Badge>
}

function getContractStatusBadge(status: string) {
  switch (status) {
    case "Pending":
      return (
        <Badge className="bg-blue-100 text-blue-800 border-blue-200">
          <Loader className="w-3 h-3 mr-1" />
          Pending
        </Badge>
      )
    case "Executing":
      return (
        <Badge className="bg-amber-100 text-amber-800 border-amber-200">
          <Clock className="w-3 h-3 mr-1" />
          Executing
        </Badge>
      )
    case "Settled":
      return (
        <Badge className="bg-green-100 text-green-800 border-green-200">
          <CheckCircle className="w-3 h-3 mr-1" />
          Settled
        </Badge>
      )
    case "Failed":
      return (
        <Badge className="bg-red-100 text-red-800 border-red-200">
          <XCircle className="w-3 h-3 mr-1" />
          Failed
        </Badge>
      )
    default:
      return <Badge variant="outline" className="bg-gray-100 border-gray-300 text-gray-800">{status}</Badge>
  }
}

function getQuorumBadge(quorum: string) {
  if (quorum === "Pass")
    return <Badge className="bg-green-100 text-green-800 border-green-200">Pass</Badge>
  return <Badge className="bg-red-100 text-red-800 border-red-200">Fail</Badge>
}

function getQoDBadge(qod: number | null | undefined) {
  if (qod === null || qod === undefined) return <Badge variant="outline" className="bg-gray-100 border-gray-300 text-gray-800 px-3 py-1 text-sm font-medium">N/A</Badge>
  if (qod >= 80)
    return <Badge className="bg-green-100 text-green-800 border-green-200 px-3 py-1 text-sm font-medium">{qod}%</Badge>
  if (qod >= 50)
    return <Badge className="bg-amber-100 text-amber-800 border-amber-200 px-3 py-1 text-sm font-medium">{qod}%</Badge>
  return <Badge className="bg-red-100 text-red-800 border-red-200 px-3 py-1 text-sm font-medium">{qod}%</Badge>
}

function formatTimeAgo(date: Date) {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ago`
}

export default function GuardianConsole() {
  const [environment, setEnvironment] = useState("Dev")
  const [lastUpdated, setLastUpdated] = useState(new Date())
  const [connectionStatus, setConnectionStatus] = useState<"connected" | "disconnected" | "error">("disconnected")

  const [anchors, setAnchors] = useState<Anchor[]>([])
  const [anchorSearch, setAnchorSearch] = useState("")
  const [selectedAnchor, setSelectedAnchor] = useState<Anchor | null>(null)

  const [navigators, setNavigators] = useState<Navigator[]>([])
  const [navigatorSearch, setNavigatorSearch] = useState("")
  const [selectedNavigator, setSelectedNavigator] = useState<Navigator | null>(null)

  const [contracts, setContracts] = useState<SmartContract[]>([])
  const [contractSearch, setContractSearch] = useState("")
  const [contractStatusFilter, setContractStatusFilter] = useState("all")
  const [selectedContract, setSelectedContract] = useState<SmartContract | null>(null)

  // Expanded card states
  const [expandedAnchor, setExpandedAnchor] = useState<string | null>(null)
  const [expandedNavigator, setExpandedNavigator] = useState<string | null>(null)

  // WebSocket connection
  const [ws, setWs] = useState<WebSocket | null>(null)

  // Setup WebSocket connection
  useEffect(() => {
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000/ws'

    const websocket = new WebSocket(wsUrl)

    websocket.onopen = () => {
      console.log('✅ WebSocket connected')
      setConnectionStatus("connected")
    }

    websocket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data)

        // Handle navigator completion message
        if (message.type === 'navigator_completed' && message.contract) {
          const contract = message.contract

          // Add new smart contract
          const newContract: SmartContract = {
            txId: contract.txId,
            navigatorId: contract.navigatorName || contract.navigatorId,
            robotId: contract.navigatorName || contract.navigatorId,
            anchorPhone: contract.anchorPhone,
            anchors: [contract.anchorPhone], // Use anchor destination as anchors array
            asset: "Navigation completion",
            price: contract.price,
            currency: contract.currency as "credits" | "USDC",
            status: contract.status as "Pending" | "Executing" | "Settled" | "Failed",
            qodQuorum: "Pass",
            timestamp: new Date(contract.timestamp),
            dop: 0,
            minAnchors: 1,
            actualAnchors: 1,
          }

          setContracts(prevContracts => [newContract, ...prevContracts])

          console.log(`📸 Navigator ${contract.navigator_name} completed at ${contract.destination}`)
        }

        // Handle other message types (initial data, updates, etc.)
        if (message.type === 'initial' || message.type === 'update') {
          const { data } = message
          if (data.anchors) setAnchors(data.anchors)
          if (data.navigators) setNavigators(data.navigators)
        }
      } catch (error) {
        console.error('Error processing WebSocket message:', error)
      }
    }

    websocket.onerror = (error) => {
      console.error('WebSocket error:', error)
      setConnectionStatus("error")
    }

    websocket.onclose = () => {
      console.log('WebSocket disconnected')
      setConnectionStatus("disconnected")
    }

    setWs(websocket)

    return () => {
      if (websocket.readyState === WebSocket.OPEN) {
        websocket.close()
      }
    }
  }, [])

  // Fetch data from FastAPI server
  useEffect(() => {
    const fetchData = async () => {
      // Get FastAPI server URL from environment or use default
      const apiUrl = process.env.NEXT_PUBLIC_FASTAPI_URL || 'http://localhost:8000'
      
      try {
        // Fetch aggregated data from FastAPI
        const response = await fetch(`${apiUrl}/api/all`, {
          signal: AbortSignal.timeout(2000)
        })

        if (response.ok) {
          const data = await response.json()

          // Update anchors - only devices with role "anchor"
          const anchorDevices = data.anchors || []
          setAnchors(anchorDevices)

          // Update navigators - only devices with role "navigator"
          const navigatorDevices = data.navigators || []
          setNavigators(navigatorDevices)

          // Update connection status
          setConnectionStatus(data.connection_count > 0 ? "connected" : "disconnected")
          setLastUpdated(new Date())

          console.log(`✅ Connected to FastAPI server - ${data.connection_count} devices online`)
          console.log(`   Anchors: ${anchorDevices.length}, Navigators: ${navigatorDevices.length}`)
        } else {
          console.error('Failed to fetch from FastAPI server')
          setConnectionStatus("error")
        }

        // Removed fetching contracts from API endpoint to prevent duplicates
        // Contracts are now only received via WebSocket in real-time
      } catch (error) {
        console.error('Error connecting to FastAPI server:', error)
        setConnectionStatus("disconnected")
        setAnchors([])
        setNavigators([])
      }
    }

    // Initial fetch
    fetchData()

    // Poll every second
    const interval = setInterval(fetchData, 1000)

    return () => clearInterval(interval)
  }, [])

  const filteredAnchors = anchors.filter((anchor) => {
    const matchesSearch =
      (anchor.id || "").toLowerCase().includes(anchorSearch.toLowerCase()) ||
      (anchor.name || "").toLowerCase().includes(anchorSearch.toLowerCase()) ||
      (anchor.destination || "").toLowerCase().includes(anchorSearch.toLowerCase())
    return matchesSearch
  })

  const filteredNavigators = navigators.filter((navigator) => {
    const matchesSearch =
      (navigator.id || "").toLowerCase().includes(navigatorSearch.toLowerCase()) ||
      (navigator.name || "").toLowerCase().includes(navigatorSearch.toLowerCase()) ||
      (navigator.targetAnchor || "").toLowerCase().includes(navigatorSearch.toLowerCase())
    return matchesSearch
  })

  const filteredContracts = contracts.filter((contract) => {
    const matchesSearch =
      contract.txId.toLowerCase().includes(contractSearch.toLowerCase()) ||
      contract.navigatorId.toLowerCase().includes(contractSearch.toLowerCase())
    const matchesStatus = contractStatusFilter === "all" || contract.status === contractStatusFilter
    return matchesSearch && matchesStatus
  })

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/60">
        <div className="flex h-20 items-center justify-center px-4 relative">
          <h1 className="text-2xl font-bold text-center text-gray-900">AI GUARDIAN</h1>
          
          <div className="absolute right-4">
            <Select defaultValue="production">
              <SelectTrigger className="w-32 bg-white border-gray-300 text-gray-900">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="production">Production</SelectItem>
                <SelectItem value="staging">Staging</SelectItem>
                <SelectItem value="development">Development</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="absolute left-4 flex items-center space-x-2 text-sm text-gray-600">
            <div className="flex items-center space-x-1">
              {connectionStatus === "connected" ? (
                <>
                  <Wifi className="h-4 w-4 text-green-500" />
                  <span className="text-green-500">Connected</span>
                </>
              ) : (
                <>
                  <WifiOff className="h-4 w-4 text-red-500" />
                  <span className="text-red-500">Disconnected</span>
                </>
              )}
            </div>
            <span>•</span>
            <span>Updated {formatTimeAgo(lastUpdated)}</span>
          </div>
        </div>
      </header>

      {/* Three Column Layout */}
      <div className="flex h-[calc(100vh-5rem)] gap-4 p-6">
        {/* Left Panel - Anchors (30%) */}
        <div className="w-[30%] border-r border-gray-200">
          <div className="border-b border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Anchors</h2>
              <Input
                placeholder="Search anchors..."
                value={anchorSearch}
                onChange={(e) => setAnchorSearch(e.target.value)}
                className="w-40 bg-white border-gray-300 text-gray-900 placeholder-gray-500"
              />
            </div>
          </div>

          <div className="p-4 overflow-y-auto">
            {filteredAnchors.length === 0 ? (
              <div className="text-center text-gray-500 py-8">
                {connectionStatus === "connected" ? "No anchors connected" : "Waiting for iOS app connection..."}
              </div>
            ) : (
              <div className="space-y-2">
                {filteredAnchors.map((anchor) => {
                  const isExpanded = expandedAnchor === anchor.id
                  return (
                    <Card
                      key={anchor.id}
                      className="cursor-pointer transition-all hover:shadow-md border-l-4 border-l-blue-500 min-h-[80px] flex flex-col justify-between bg-white border-gray-200 text-gray-900 hover:bg-gray-50"
                    >
                      {/* Collapsed View */}
                      <div 
                        className="p-4"
                        onClick={() => setExpandedAnchor(isExpanded ? null : anchor.id)}
                      >
                        <div className="space-y-3">
                          {/* Main row with Agent ID */}
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-2">
                              <span className="text-sm text-gray-500 font-medium">ID:</span>
                              <span className="font-mono text-gray-900 text-lg font-semibold truncate">
                                {anchor.name || "Unknown"}
                              </span>
                            </div>
                            {getStatusBadge(anchor.status)}
                          </div>
                          
                          {/* QoD row */}
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-2">
                              <span className="text-sm text-gray-500 font-medium">QoD:</span>
                              {getQoDBadge(anchor.qod)}
                            </div>
                            <span className="text-sm text-gray-500">
                              {isExpanded ? "Click to collapse" : "Click to expand"}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Expanded View */}
                      {isExpanded && (
                        <div className="px-3 pb-3 pt-3 space-y-3 border-t border-gray-200">
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-gray-500">Location</span>
                            <Badge variant="outline" className="bg-gray-700 border-gray-200 text-gray-200 text-xs px-3 py-1">
                              {anchor.destination || "N/A"}
                            </Badge>
                          </div>
                          
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-gray-500">Battery</span>
                            <div className="flex items-center space-x-1">
                              {getBatteryIcon(anchor.battery)}
                              <span className="text-sm">
                                {anchor.battery !== undefined ? `${anchor.battery}%` : "--"}
                              </span>
                            </div>
                          </div>
                          
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-gray-500">Error</span>
                            {anchor.anchorConnections && anchor.anchorConnections.length > 0 ? (
                              (() => {
                                const errors = anchor.anchorConnections
                                  .map(conn => conn.percentError)
                                  .filter(err => err !== undefined) as number[]
                                
                                if (errors.length === 0) return <span className="text-gray-500 text-sm">--</span>
                                
                                const avgError = errors.reduce((sum, err) => sum + Math.abs(err), 0) / errors.length
                                
                                return (
                                  <Badge 
                                    variant={avgError < 5 ? "default" : 
                                            avgError < 10 ? "secondary" : "destructive"}
                                    className="text-xs"
                                  >
                                    {avgError.toFixed(1)}% ({errors.length})
                                  </Badge>
                                )
                              })()
                            ) : (
                              <span className="text-gray-500 text-sm">--</span>
                            )}
                          </div>

                          <div className="flex items-center justify-between">
                            <span className="text-sm text-gray-500">Connected Anchors</span>
                            <Badge variant="secondary" className="bg-gray-100 text-gray-700 border-gray-200 text-xs px-3 py-1">
                              {anchor.anchorConnections ? anchor.anchorConnections.length : 0}
                            </Badge>
                          </div>

                          <div className="flex items-center justify-between">
                            <span className="text-sm text-gray-500">Connected Navigators</span>
                            <Badge variant="secondary" className="bg-gray-100 text-gray-700 border-gray-200 text-xs px-3 py-1">
                              {anchor.connectedNavigators || 0}
                            </Badge>
                          </div>

                          <div className="pt-2 border-t border-gray-200">
                            <button 
                              className="text-xs text-blue-600 hover:text-blue-500"
                              onClick={(e) => {
                                e.stopPropagation()
                                setSelectedAnchor(anchor)
                              }}
                            >
                              View Details →
                            </button>
                          </div>
                        </div>
                      )}
                    </Card>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Middle Panel - Navigators (30%) */}
        <div className="w-[30%] border-r border-gray-200">
          <div className="border-b border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Navigators</h2>
              <Input
                placeholder="Search navigators..."
                value={navigatorSearch}
                onChange={(e) => setNavigatorSearch(e.target.value)}
                className="w-40 bg-white border-gray-300 text-gray-900 placeholder-gray-500"
              />
            </div>
          </div>

          <div className="p-4 overflow-y-auto">
            {filteredNavigators.length === 0 ? (
              <div className="text-center text-gray-500 py-8">
                {connectionStatus === "connected" ? "No navigators connected" : "Waiting for iOS app connection..."}
              </div>
            ) : (
              <div className="space-y-2">
                {filteredNavigators.map((navigator) => {
                  const isExpanded = expandedNavigator === navigator.id
                  return (
                    <Card
                      key={navigator.id}
                      className="cursor-pointer transition-all hover:shadow-md border-l-4 border-l-green-500 min-h-[80px] flex flex-col justify-between bg-white border-gray-200 text-gray-900 hover:bg-gray-50"
                    >
                      {/* Collapsed View */}
                      <div 
                        className="p-4"
                        onClick={() => setExpandedNavigator(isExpanded ? null : navigator.id)}
                      >
                        <div className="space-y-3">
                          {/* Main row with Agent ID */}
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-2">
                              <span className="text-sm text-gray-500 font-medium">ID:</span>
                              <span className="font-mono text-gray-900 text-lg font-semibold truncate">
                                {navigator.name || "Unknown"}
                              </span>
                            </div>
                            {getStatusBadge(navigator.status)}
                          </div>
                          
                          {/* QoD row */}
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-2">
                              <span className="text-sm text-gray-500 font-medium">QoD:</span>
                              <Badge className="bg-green-100 text-green-800 border-green-200 px-3 py-1 text-sm font-medium">100%</Badge>
                            </div>
                            <span className="text-sm text-gray-500">
                              {isExpanded ? "Click to collapse" : "Click to expand"}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Expanded View */}
                      {isExpanded && (
                        <div className="px-3 pb-3 pt-3 space-y-3 border-t border-gray-200">
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-gray-500">Target Anchor</span>
                            <Badge variant="outline" className="bg-gray-700 border-gray-200 text-gray-200 text-xs px-3 py-1">
                              {navigator.targetAnchor || "None"}
                            </Badge>
                          </div>
                          
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-gray-500">Battery</span>
                            <div className="flex items-center space-x-1">
                              {getBatteryIcon(navigator.battery)}
                              <span className="text-sm">
                                {navigator.battery !== undefined ? `${navigator.battery}%` : "--"}
                              </span>
                            </div>
                          </div>
                          
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-gray-500">Connected Anchors</span>
                            <Badge variant="secondary" className="bg-gray-100 text-gray-700 border-gray-200 text-xs px-3 py-1">
                              {navigator.connectedAnchors || 0}
                            </Badge>
                          </div>

                          {Object.keys(navigator.distances).length > 0 && (
                            <div className="pt-2 border-t border-gray-200">
                              <span className="text-xs text-gray-500 mb-2 block">Distances</span>
                              <div className="space-y-1">
                                {Object.entries(navigator.distances).slice(0, 3).map(([anchorId, distance]) => (
                                  <div key={anchorId} className="flex items-center justify-between text-xs">
                                    <span className="font-mono text-gray-900 truncate">{anchorId}</span>
                                    <Badge variant="outline" className="bg-gray-700 border-gray-200 text-gray-200 text-xs">
                                      {distance.toFixed(2)}m
                                    </Badge>
                                  </div>
                                ))}
                                {Object.keys(navigator.distances).length > 3 && (
                                  <div className="text-xs text-gray-500 text-center">
                                    +{Object.keys(navigator.distances).length - 3} more
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          <div className="pt-2 border-t border-gray-200">
                            <button 
                              className="text-xs text-green-600 hover:text-green-500"
                              onClick={(e) => {
                                e.stopPropagation()
                                setSelectedNavigator(navigator)
                              }}
                            >
                              View Details →
                            </button>
                          </div>
                        </div>
                      )}
                    </Card>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Panel - Smart Contracts (40%) */}
        <div className="w-[40%] border-r-0">
          <div className="border-b border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Smart Contracts</h2>
              <div className="flex items-center space-x-2">
                <Input
                  placeholder="Search contracts..."
                  value={contractSearch}
                  onChange={(e) => setContractSearch(e.target.value)}
                  className="w-40 bg-white border-gray-300 text-gray-900 placeholder-gray-500"
                />
              </div>
            </div>
          </div>

          <div className="p-4">
            <Table className="bg-white border-gray-200">
              <TableHeader className="bg-gray-100">
                <TableRow className="border-gray-200">
                  <TableHead className="text-gray-700">Tx ID</TableHead>
                  <TableHead className="text-gray-700">Navigator</TableHead>
                  <TableHead className="text-gray-700">Price</TableHead>
                  <TableHead className="text-gray-700">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredContracts.map((contract) => (
                  <TableRow
                    key={contract.txId}
                    className="cursor-pointer border-gray-200 hover:bg-gray-50"
                    onClick={() => setSelectedContract(contract)}
                  >
                    <TableCell className="font-mono text-gray-900 text-xs text-gray-900">{contract.txId.slice(0, 10)}...</TableCell>
                    <TableCell className="text-xs text-gray-900">{contract.navigatorId}</TableCell>
                    <TableCell className="text-xs text-gray-900">
                      {contract.price} {contract.currency}
                    </TableCell>
                    <TableCell className="text-gray-900">{getContractStatusBadge(contract.status)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>

      {/* Anchor Detail Sheet */}
      <Sheet open={!!selectedAnchor} onOpenChange={() => setSelectedAnchor(null)}>
        <SheetContent className="w-[400px] sm:w-[540px] bg-white border-gray-200 text-gray-900">
          <SheetHeader>
            <SheetTitle className="text-gray-900">{selectedAnchor?.name}</SheetTitle>
            <SheetDescription className="text-gray-500">
              Anchor at {selectedAnchor?.destination} • ID: {selectedAnchor?.id}
            </SheetDescription>
          </SheetHeader>

          {selectedAnchor && (
            <div className="mt-6 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm font-medium text-gray-900">Battery Level</div>
                  <div className="flex items-center gap-2 mt-1">
                    {getBatteryIcon(selectedAnchor.battery)}
                    <span className="text-lg font-mono text-gray-900">{selectedAnchor.battery}%</span>
                  </div>
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-900">Status</div>
                  <div className="mt-1">{getStatusBadge(selectedAnchor.status)}</div>
                </div>
              </div>

              {/* Anchor-to-Anchor Connections */}
              {selectedAnchor.anchorConnections && selectedAnchor.anchorConnections.length > 0 && (
                <div className="space-y-3 p-4 bg-white/50 rounded-lg">
                  <h4 className="font-medium flex items-center gap-2">
                    <Activity className="h-4 w-4" />
                    Anchor-to-Anchor Connections ({selectedAnchor.anchorConnections.length})
                  </h4>
                  {selectedAnchor.anchorConnections.map((conn, idx) => {
                    // Calculate error on webapp side if not provided
                    let percentError = conn.percentError
                    let distanceError = conn.distanceError
                    
                    if (percentError === undefined && conn.measuredDistance !== undefined && selectedAnchor.destination && conn.connectedTo) {
                      const calcResult = calculateError(conn.measuredDistance, selectedAnchor.destination, conn.connectedTo)
                      if (calcResult) {
                        percentError = calcResult.percentError
                        distanceError = calcResult.error
                      }
                    }
                    
                    return (
                      <div key={idx} className="space-y-2 text-sm border-t border-gray-200 pt-3 first:border-t-0 first:pt-0">
                        <div className="flex justify-between">
                          <span className="text-gray-500">Connected To</span>
                          <Badge variant="outline" className="bg-gray-700 border-gray-200 text-gray-200">{conn.connectedTo}</Badge>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">Measured Distance</span>
                          <span className="font-mono text-gray-900">
                            {conn.measuredDistance?.toFixed(2) || "--"} m
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">Expected Distance</span>
                          <span className="font-mono text-gray-900">
                            {conn.expectedDistance?.toFixed(2) || GROUND_TRUTH_DISTANCES[`${selectedAnchor.destination}-${conn.connectedTo}`]?.toFixed(2) || "--"} m
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">Distance Error</span>
                          <span className={`font-mono text-gray-900 ${
                            percentError !== undefined && Math.abs(percentError) < 5 
                              ? "text-green-500" 
                              : percentError !== undefined && Math.abs(percentError) < 10
                              ? "text-orange-500"
                              : "text-red-500"
                          }`}>
                            {distanceError?.toFixed(2) || "--"} m
                            {percentError !== undefined && (
                              <span className="text-xs">
                                {" ("}{percentError.toFixed(1)}%)
                              </span>
                            )}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Navigator Distances */}
              {selectedAnchor.navigatorDistances && selectedAnchor.navigatorDistances.length > 0 && (
                <div className="space-y-3">
                  <h4 className="font-medium">Navigator Distances</h4>
                  <div className="space-y-2 text-sm">
                    {selectedAnchor.navigatorDistances.map((nav) => (
                      <div key={nav.id} className="flex justify-between">
                        <span className="text-gray-500">{nav.name}</span>
                        <span className="font-mono text-gray-900">{nav.distance?.toFixed(2) || "--"} m</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-3">
                <h4 className="font-medium">Device Information</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Device Name</span>
                    <span>{selectedAnchor.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">User ID</span>
                    <span className="font-mono text-gray-900 text-xs">{selectedAnchor.id}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Location</span>
                    <span>{selectedAnchor.destination}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Connected Navigators</span>
                    <span>{selectedAnchor.connectedNavigators}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Navigator Detail Sheet */}
      <Sheet open={!!selectedNavigator} onOpenChange={() => setSelectedNavigator(null)}>
        <SheetContent className="w-[400px] sm:w-[540px] bg-white border-gray-200 text-gray-900">
          <SheetHeader>
            <SheetTitle className="text-gray-900">{selectedNavigator?.name}</SheetTitle>
            <SheetDescription className="text-gray-500">
              Navigating to {selectedNavigator?.targetAnchor} • ID: {selectedNavigator?.id}
            </SheetDescription>
          </SheetHeader>

          {selectedNavigator && (
            <div className="mt-6 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm font-medium text-gray-900">Battery Level</div>
                  <div className="flex items-center gap-2 mt-1">
                    {getBatteryIcon(selectedNavigator.battery)}
                    <span className="text-lg font-mono text-gray-900">{selectedNavigator.battery}%</span>
                  </div>
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-900">Status</div>
                  <div className="mt-1">{getStatusBadge(selectedNavigator.status)}</div>
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="font-medium">Navigation Details</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Target Anchor</span>
                    <span className="font-medium">{selectedNavigator.targetAnchor}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Connected Anchors</span>
                    <span className="font-medium">{selectedNavigator.connectedAnchors}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="font-medium">Distance to Anchors</h4>
                <div className="space-y-2">
                  {Object.entries(selectedNavigator.distances).map(([anchorId, distance]) => (
                    <div key={anchorId} className="flex items-center justify-between text-sm">
                      <span className="font-mono text-gray-900">{anchorId}</span>
                      <Badge variant="outline" className="bg-gray-700 border-gray-200 text-gray-200">{distance.toFixed(2)}m</Badge>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="font-medium">Device Information</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Device Name</span>
                    <span>{selectedNavigator.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">User ID</span>
                    <span className="font-mono text-gray-900 text-xs">{selectedNavigator.id}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Smart Contract Detail Sheet (keeping as is) */}
      <Sheet open={!!selectedContract} onOpenChange={() => setSelectedContract(null)}>
        <SheetContent className="w-[400px] sm:w-[540px] bg-white border-gray-200 text-gray-900">
          <SheetHeader>
            <SheetTitle className="text-gray-900">Contract {selectedContract?.txId}</SheetTitle>
            <SheetDescription className="text-gray-500">
              {selectedContract?.navigatorId} • {formatTimeAgo(selectedContract?.timestamp || new Date())}
            </SheetDescription>
          </SheetHeader>

          {selectedContract && (
            <div className="mt-6 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm font-medium text-gray-900">Status</div>
                  <div className="mt-1">{getContractStatusBadge(selectedContract.status)}</div>
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-900">QoD Quorum</div>
                  <div className="mt-1">{getQuorumBadge(selectedContract.qodQuorum)}</div>
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="font-medium">Contract Terms</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Asset</span>
                    <span className="font-medium">{selectedContract.asset}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Price</span>
                    <span className="font-medium">
                      {selectedContract.price} {selectedContract.currency}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Navigator</span>
                    <span className="font-mono text-gray-900">{selectedContract.navigatorId}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="font-medium">Participating Anchors</h4>
                <div className="space-y-2">
                  {selectedContract.anchors.map((anchorId) => (
                    <div key={anchorId} className="flex items-center justify-between text-sm">
                      <span className="font-mono text-gray-900">{anchorId}</span>
                      <Badge variant="outline" className="bg-gray-700 border-gray-200 text-gray-200">Active</Badge>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Copyright Notice */}
      <div className="fixed bottom-4 right-4">
        <p className="text-xs text-gray-400">
          © 2025 Nisshinbo Holdings Inc. All rights reserved.
        </p>
      </div>
    </div>
  )
}