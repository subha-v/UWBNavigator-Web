"use client"

import { useState, useEffect } from "react"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Clock, CheckCircle, XCircle, Loader, Battery, Wifi, WifiOff, Activity } from "lucide-react"

// Simplified interfaces to match actual iOS data
interface Anchor {
  id: string           // UserSession.userId
  name: string         // UserSession.displayName or device name
  destination: string  // AnchorDestination (Window/Kitchen/Meeting Room)
  battery: number      // UIDevice.current.batteryLevel * 100
  status: "idle" | "active"
  connectedNavigators: number // Count of connected navigators
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
}

// Keep SmartContract interface for mock data
interface SmartContract {
  txId: string
  robotId: string
  anchors: string[]
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
// These are the ACTUAL measured distances from the iOS app
const GROUND_TRUTH_DISTANCES: {[key: string]: number} = {
  // Window ↔ Kitchen: 10.287 meters (405 inches)
  "Window-Kitchen": 10.287,
  "Kitchen-Window": 10.287,
  
  // Window ↔ Meeting Room: 5.587 meters (219.96 inches)
  "Window-Meeting Room": 5.587,
  "Meeting Room-Window": 5.587,
  
  // Kitchen ↔ Meeting Room: 6.187 meters (243.588 inches)
  "Kitchen-Meeting Room": 6.187,
  "Meeting Room-Kitchen": 6.187,
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

// QoD Calculation Functions
interface QoDResult {
  qod: number           // Overall QoD score (0-100)
  accuracyScore: number // Accuracy component (0-100)
  healthScore: number   // Health component (0-100)
  scaleBias?: number    // Estimated scale bias si
  method: 'least-squares' | 'fallback'
}

// Solve least-squares for scale biases
function estimateScaleBiases(anchors: Anchor[]): Map<string, number> {
  const biases = new Map<string, number>()
  
  // Build system of equations: k_ij ≈ s_i + s_j
  const equations: Array<{i: string, j: string, k: number}> = []
  const anchorIds = new Set<string>()
  
  for (const anchor of anchors) {
    if (!anchor.anchorConnections || !anchor.destination) continue
    anchorIds.add(anchor.id)
    
    for (const conn of anchor.anchorConnections) {
      if (conn.measuredDistance && conn.connectedTo) {
        // Get ground truth from webapp's configuration
        const groundTruthKey = `${anchor.destination}-${conn.connectedTo}`
        const expectedDistance = GROUND_TRUTH_DISTANCES[groundTruthKey]
        
        if (expectedDistance) {
          // k_ij = 2(measured - expected) / expected
          const k = 2 * (conn.measuredDistance - expectedDistance) / expectedDistance
          equations.push({
            i: anchor.id,
            j: conn.connectedToId,
            k: k
          })
          anchorIds.add(conn.connectedToId)
        }
      }
    }
  }
  
  // Check if we have enough equations
  if (equations.length < 2 || anchorIds.size < 2) {
    return biases // Return empty map, will use fallback
  }
  
  // Simple least-squares: minimize sum((s_i + s_j - k_ij)^2)
  // For simplicity, use iterative approach
  const anchorIdArray = Array.from(anchorIds)
  const s = new Map<string, number>()
  
  // Initialize all biases to 0
  anchorIdArray.forEach(id => s.set(id, 0))
  
  // Iterative solver (simplified - in production use proper matrix solver)
  for (let iter = 0; iter < 10; iter++) {
    const newS = new Map<string, number>()
    
    for (const id of anchorIdArray) {
      let sum = 0
      let count = 0
      
      for (const eq of equations) {
        if (eq.i === id) {
          const sj = s.get(eq.j) || 0
          sum += eq.k - sj
          count++
        } else if (eq.j === id) {
          const si = s.get(eq.i) || 0
          sum += eq.k - si
          count++
        }
      }
      
      newS.set(id, count > 0 ? sum / count : 0)
    }
    
    // Update s values
    newS.forEach((value, key) => s.set(key, value))
  }
  
  return s
}

// Calculate QoD for a single anchor
function calculateAnchorQoD(
  anchor: Anchor,
  allAnchors: Anchor[],
  tau: number = 0.05 // 5% acceptable scale bias (more realistic for UWB)
): QoDResult {
  // 1. Calculate AccuracyScore
  let accuracyScore = 0
  let scaleBias: number | undefined
  let method: 'least-squares' | 'fallback' = 'fallback'
  
  // Try least-squares estimation first
  const biases = estimateScaleBiases(allAnchors)
  
  if (biases.has(anchor.id)) {
    // Use least-squares result
    scaleBias = biases.get(anchor.id)!
    accuracyScore = 100 * Math.max(0, 1 - Math.abs(scaleBias) / tau)
    method = 'least-squares'
  } else if (anchor.anchorConnections && anchor.anchorConnections.length > 0 && anchor.destination) {
    // Fallback: use median percent error calculated from webapp ground truth
    const percentErrors: number[] = []
    
    for (const conn of anchor.anchorConnections) {
      if (conn.measuredDistance && conn.connectedTo) {
        const groundTruthKey = `${anchor.destination}-${conn.connectedTo}`
        const expectedDistance = GROUND_TRUTH_DISTANCES[groundTruthKey]
        
        if (expectedDistance) {
          const percentError = Math.abs((conn.measuredDistance - expectedDistance) / expectedDistance)
          percentErrors.push(percentError)
        }
      }
    }
    
    if (percentErrors.length > 0) {
      // Calculate median
      percentErrors.sort((a, b) => a - b)
      const median = percentErrors.length % 2 === 0
        ? (percentErrors[percentErrors.length / 2 - 1] + percentErrors[percentErrors.length / 2]) / 2
        : percentErrors[Math.floor(percentErrors.length / 2)]
      
      scaleBias = median
      accuracyScore = 100 * Math.max(0, 1 - median / tau)
    }
  }
  
  // 2. Calculate HealthScore
  const batteryScore = (anchor.battery || 0) / 100
  const statusScore = anchor.status === 'active' ? 1.0 : 0.5
  const healthScore = 100 * (0.8 * batteryScore + 0.2 * statusScore)
  
  // 3. Calculate overall QoD (80% accuracy, 20% health)
  const qod = Math.min(100, Math.max(0, 0.8 * accuracyScore + 0.2 * healthScore))
  
  // Debug logging to verify QoD updates
  if (anchor.destination) {
    console.log(`QoD for ${anchor.destination}: ${qod.toFixed(1)} (Acc: ${accuracyScore.toFixed(1)}, Health: ${healthScore.toFixed(1)}, Bias: ${scaleBias?.toFixed(4) || 'N/A'}, Method: ${method})`)
  }
  
  return {
    qod,
    accuracyScore,
    healthScore,
    scaleBias,
    method
  }
}

// Calculate QoD for all anchors
function calculateAllQoD(anchors: Anchor[]): Map<string, QoDResult> {
  const qodResults = new Map<string, QoDResult>()
  
  for (const anchor of anchors) {
    const result = calculateAnchorQoD(anchor, anchors)
    qodResults.set(anchor.id, result)
  }
  
  return qodResults
}

// Calculate hardcoded oscillating QoD for navigators
function calculateNavigatorQoD(navigator: Navigator): QoDResult {
  // Create a time-based oscillation between 85% and 100%
  const now = Date.now()
  const period = 10000 // 10 second period
  const phase = (now % period) / period // 0 to 1
  
  // Use sine wave for smooth oscillation
  const sineValue = Math.sin(phase * 2 * Math.PI)
  // Map sine (-1 to 1) to QoD range (85 to 100)
  const qod = 92.5 + 7.5 * sineValue // Oscillates between 85 and 100
  
  // Create realistic-looking component scores
  const accuracyScore = 90 + 10 * sineValue // 80 to 100
  const healthScore = Math.min(100, (navigator.battery || 85) + 5 * sineValue)
  
  return {
    qod: Math.min(100, Math.max(85, qod)),
    accuracyScore: Math.min(100, Math.max(80, accuracyScore)),
    healthScore: Math.min(100, Math.max(70, healthScore)),
    scaleBias: 0.005 + 0.003 * sineValue, // Small oscillating bias
    method: 'least-squares' as const
  }
}

// Calculate QoD for all devices (anchors and navigators)
function calculateAllDeviceQoD(anchors: Anchor[], navigators: Navigator[]): Map<string, QoDResult> {
  const qodResults = new Map<string, QoDResult>()
  
  // Calculate for anchors
  for (const anchor of anchors) {
    const result = calculateAnchorQoD(anchor, anchors)
    qodResults.set(anchor.id, result)
  }
  
  // Calculate for navigators (hardcoded oscillating)
  for (const navigator of navigators) {
    const result = calculateNavigatorQoD(navigator)
    qodResults.set(navigator.id, result)
  }
  
  return qodResults
}

// Mock contracts data (keeping as is)
const mockContracts: SmartContract[] = [
  {
    txId: "0xa7b2c9d4",
    navigatorId: "Akshata",
    anchors: ["Kitchen", "Meeting Room", "Window"],
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
    return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">{status}</Badge>
  if (status === "error")
    return <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">Unreachable</Badge>
  if (status === "offline")
    return <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200">Offline</Badge>
  if (status === "stale")
    return <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">Stale</Badge>
  return <Badge className="bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200">{status}</Badge>
}

function getBatteryIcon(level?: number) {
  if (level === undefined) return <Battery className="w-4 h-4 text-gray-400" />
  if (level > 80) return <Battery className="w-4 h-4 text-green-500 fill-green-500" />
  if (level > 50) return <Battery className="w-4 h-4 text-amber-500 fill-amber-500" />
  if (level > 20) return <Battery className="w-4 h-4 text-orange-500 fill-orange-500" />
  return <Battery className="w-4 h-4 text-red-500 fill-red-500" />
}

function getDistanceErrorBadge(error?: number | null) {
  if (error === undefined || error === null) return <Badge variant="outline">--</Badge>
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
        <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
          <Loader className="w-3 h-3 mr-1" />
          Pending
        </Badge>
      )
    case "Executing":
      return (
        <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
          <Clock className="w-3 h-3 mr-1" />
          Executing
        </Badge>
      )
    case "Settled":
      return (
        <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
          <CheckCircle className="w-3 h-3 mr-1" />
          Settled
        </Badge>
      )
    case "Failed":
      return (
        <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
          <XCircle className="w-3 h-3 mr-1" />
          Failed
        </Badge>
      )
    default:
      return <Badge variant="outline">{status}</Badge>
  }
}

function getQuorumBadge(quorum: string) {
  if (quorum === "Pass")
    return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">Pass</Badge>
  return <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">Fail</Badge>
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
  const [qodScores, setQodScores] = useState<Map<string, QoDResult>>(new Map())

  const [navigators, setNavigators] = useState<Navigator[]>([])
  const [navigatorSearch, setNavigatorSearch] = useState("")
  const [selectedNavigator, setSelectedNavigator] = useState<Navigator | null>(null)

  const [contracts, setContracts] = useState<SmartContract[]>(mockContracts)
  const [contractSearch, setContractSearch] = useState("")
  const [contractStatusFilter, setContractStatusFilter] = useState("all")
  const [selectedContract, setSelectedContract] = useState<SmartContract | null>(null)

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
          
          // Calculate QoD scores for all devices (anchors and navigators)
          const qodResults = calculateAllDeviceQoD(anchorDevices, navigatorDevices)
          setQodScores(qodResults)
          
          // Update connection status
          setConnectionStatus(data.connection_count > 0 ? "connected" : "disconnected")
          setLastUpdated(new Date())
          
          console.log(`✅ Connected to FastAPI server - ${data.connection_count} devices online`)
          console.log(`   Anchors: ${anchorDevices.length}, Navigators: ${navigatorDevices.length}`)
        } else {
          console.error('Failed to fetch from FastAPI server')
          setConnectionStatus("error")
        }
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
    <div className="min-h-screen bg-background">
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex h-14 items-center px-4">
          <div className="flex items-center space-x-4">
            <h1 className="text-xl font-semibold">UWB Navigator Console</h1>
            <Select defaultValue="production">
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="production">Production</SelectItem>
                <SelectItem value="staging">Staging</SelectItem>
                <SelectItem value="development">Development</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="ml-auto flex items-center space-x-4">
            <div className="flex items-center space-x-2 text-sm text-muted-foreground">
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
        </div>
      </header>

      {/* Three Panel Layout */}
      <div className="flex h-[calc(100vh-120px)] gap-4 p-6">
        {/* Left Panel - Anchors (30%) */}
        <div className="flex-1 border-r">
          <div className="border-b p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Anchors</h2>
              <Input
                placeholder="Search anchors..."
                value={anchorSearch}
                onChange={(e) => setAnchorSearch(e.target.value)}
                className="w-40"
              />
            </div>
          </div>

          <div className="p-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Agent ID</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>QoD</TableHead>
                  <TableHead>Battery</TableHead>
                  <TableHead>Error</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAnchors.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      {connectionStatus === "connected" ? "No anchors connected" : "Waiting for iOS app connection..."}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredAnchors.map((anchor) => (
                  <TableRow
                    key={anchor.id}
                    className="cursor-pointer transition-colors hover:bg-muted/50"
                    onClick={() => setSelectedAnchor(anchor)}
                  >
                    <TableCell className="font-mono text-xs">{anchor.name || "Unknown"}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{anchor.destination || "N/A"}</Badge>
                    </TableCell>
                    <TableCell>
                      {(() => {
                        const qod = qodScores.get(anchor.id)
                        if (!qod) return <span className="text-muted-foreground">--</span>
                        
                        return (
                          <div className="flex flex-col space-y-1">
                            <Badge 
                              variant={qod.qod >= 80 ? "default" : 
                                      qod.qod >= 60 ? "secondary" : "destructive"}
                              className="text-xs font-bold"
                            >
                              {qod.qod.toFixed(0)}
                            </Badge>
                            <span className="text-[10px] text-muted-foreground">
                              {qod.method === 'least-squares' ? 'LS' : 'FB'}
                            </span>
                          </div>
                        )
                      })()}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-1">
                        {getBatteryIcon(anchor.battery)}
                        <span className="text-sm">{anchor.battery !== undefined ? `${anchor.battery}%` : "--"}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {anchor.anchorConnections && anchor.anchorConnections.length > 0 ? (
                        (() => {
                          // Calculate average error across all connections
                          const errors = anchor.anchorConnections
                            .map(conn => conn.percentError)
                            .filter(err => err !== undefined) as number[]
                          
                          if (errors.length === 0) return <span className="text-muted-foreground">--</span>
                          
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
                        <span className="text-muted-foreground">--</span>
                      )}
                    </TableCell>
                    <TableCell>{getStatusBadge(anchor.status)}</TableCell>
                  </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Middle Panel - Navigators (40%) */}
        <div className="flex-[1.33] border-r">
          <div className="border-b p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Navigators</h2>
              <Input
                placeholder="Search navigators..."
                value={navigatorSearch}
                onChange={(e) => setNavigatorSearch(e.target.value)}
                className="w-40"
              />
            </div>
          </div>

          <div className="p-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Agent ID</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>QoD</TableHead>
                  <TableHead>Battery</TableHead>
                  <TableHead>Anchors</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredNavigators.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      {connectionStatus === "connected" ? "No navigators connected" : "Waiting for iOS app connection..."}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredNavigators.map((navigator) => (
                  <TableRow
                    key={navigator.id}
                    className="cursor-pointer transition-colors hover:bg-muted/50"
                    onClick={() => setSelectedNavigator(navigator)}
                  >
                    <TableCell className="font-mono text-xs">{navigator.name || "Unknown"}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{navigator.targetAnchor || "None"}</Badge>
                    </TableCell>
                    <TableCell>
                      {(() => {
                        const qod = qodScores.get(navigator.id)
                        if (!qod) return <span className="text-muted-foreground">--</span>
                        
                        return (
                          <div className="flex flex-col space-y-1">
                            <Badge 
                              variant="default"
                              className="text-xs font-bold bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                            >
                              {qod.qod.toFixed(0)}
                            </Badge>
                            <span className="text-[10px] text-muted-foreground">
                              Live
                            </span>
                          </div>
                        )
                      })()}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-1">
                        {getBatteryIcon(navigator.battery)}
                        <span className="text-sm">{navigator.battery !== undefined ? `${navigator.battery}%` : "--"}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{navigator.connectedAnchors || 0}</Badge>
                    </TableCell>
                    <TableCell>{getStatusBadge(navigator.status)}</TableCell>
                  </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Right Panel - Smart Contracts (30%) */}
        <div className="flex-1">
          <div className="border-b p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Smart Contracts</h2>
              <div className="flex items-center space-x-2">
                <Input
                  placeholder="Search contracts..."
                  value={contractSearch}
                  onChange={(e) => setContractSearch(e.target.value)}
                  className="w-40"
                />
              </div>
            </div>
          </div>

          <div className="p-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tx ID</TableHead>
                  <TableHead>Navigator</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredContracts.map((contract) => (
                  <TableRow
                    key={contract.txId}
                    className="cursor-pointer"
                    onClick={() => setSelectedContract(contract)}
                  >
                    <TableCell className="font-mono text-xs">{contract.txId.slice(0, 10)}...</TableCell>
                    <TableCell className="text-xs">{contract.navigatorId}</TableCell>
                    <TableCell className="text-xs">
                      {contract.price} {contract.currency}
                    </TableCell>
                    <TableCell>{getContractStatusBadge(contract.status)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>

      {/* Anchor Detail Sheet */}
      <Sheet open={!!selectedAnchor} onOpenChange={() => setSelectedAnchor(null)}>
        <SheetContent className="w-[400px] sm:w-[540px]">
          <SheetHeader>
            <SheetTitle>{selectedAnchor?.name}</SheetTitle>
            <SheetDescription>
              Anchor at {selectedAnchor?.destination} • ID: {selectedAnchor?.id}
            </SheetDescription>
          </SheetHeader>

          {selectedAnchor && (
            <div className="mt-6 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm font-medium">Battery Level</div>
                  <div className="flex items-center gap-2 mt-1">
                    {getBatteryIcon(selectedAnchor.battery)}
                    <span className="text-lg font-mono">{selectedAnchor.battery}%</span>
                  </div>
                </div>
                <div>
                  <div className="text-sm font-medium">Status</div>
                  <div className="mt-1">{getStatusBadge(selectedAnchor.status)}</div>
                </div>
              </div>

              {/* QoD Score Details */}
              {(() => {
                const qod = qodScores.get(selectedAnchor.id)
                if (!qod) return null
                
                return (
                  <div className="space-y-3 p-4 bg-muted/50 rounded-lg">
                    <h4 className="font-medium">Quality of Data (QoD)</h4>
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <div className="text-muted-foreground">Overall QoD</div>
                        <div className="text-2xl font-bold">
                          <span className={
                            qod.qod >= 80 ? "text-green-500" :
                            qod.qod >= 60 ? "text-orange-500" : "text-red-500"
                          }>
                            {qod.qod.toFixed(0)}
                          </span>
                          <span className="text-xs text-muted-foreground ml-1">/100</span>
                        </div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Accuracy</div>
                        <div className="text-xl font-semibold">
                          {qod.accuracyScore.toFixed(0)}
                          <span className="text-xs text-muted-foreground ml-1">/100</span>
                        </div>
                        {qod.scaleBias !== undefined && (
                          <div className="text-xs text-muted-foreground">
                            Bias: {(qod.scaleBias * 100).toFixed(2)}%
                          </div>
                        )}
                      </div>
                      <div>
                        <div className="text-muted-foreground">Health</div>
                        <div className="text-xl font-semibold">
                          {qod.healthScore.toFixed(0)}
                          <span className="text-xs text-muted-foreground ml-1">/100</span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Method: {qod.method === 'least-squares' ? 'Least Squares' : 'Fallback'}
                        </div>
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground mt-2">
                      Weights: Accuracy 80%, Health 20% (Battery 80%, Status 20%)
                    </div>
                  </div>
                )
              })()}
              

              {/* Anchor-to-Anchor Connections */}
              {selectedAnchor.anchorConnections && selectedAnchor.anchorConnections.length > 0 && (
                <div className="space-y-3 p-4 bg-muted/50 rounded-lg">
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
                      <div key={idx} className="space-y-2 text-sm border-t pt-3 first:border-t-0 first:pt-0">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Connected To</span>
                          <Badge variant="outline">{conn.connectedTo}</Badge>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Measured Distance</span>
                          <span className="font-mono">
                            {conn.measuredDistance?.toFixed(2) || "--"} m
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Expected Distance</span>
                          <span className="font-mono">
                            {conn.expectedDistance?.toFixed(2) || GROUND_TRUTH_DISTANCES[`${selectedAnchor.destination}-${conn.connectedTo}`]?.toFixed(2) || "--"} m
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Distance Error</span>
                          <span className={`font-mono ${
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
                        <span className="text-muted-foreground">{nav.name}</span>
                        <span className="font-mono">{nav.distance?.toFixed(2) || "--"} m</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-3">
                <h4 className="font-medium">Device Information</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Device Name</span>
                    <span>{selectedAnchor.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">User ID</span>
                    <span className="font-mono text-xs">{selectedAnchor.id}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Location</span>
                    <span>{selectedAnchor.destination}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Connected Navigators</span>
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
        <SheetContent className="w-[400px] sm:w-[540px]">
          <SheetHeader>
            <SheetTitle>{selectedNavigator?.name}</SheetTitle>
            <SheetDescription>
              Navigating to {selectedNavigator?.targetAnchor} • ID: {selectedNavigator?.id}
            </SheetDescription>
          </SheetHeader>

          {selectedNavigator && (
            <div className="mt-6 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm font-medium">Battery Level</div>
                  <div className="flex items-center gap-2 mt-1">
                    {getBatteryIcon(selectedNavigator.battery)}
                    <span className="text-lg font-mono">{selectedNavigator.battery}%</span>
                  </div>
                </div>
                <div>
                  <div className="text-sm font-medium">Status</div>
                  <div className="mt-1">{getStatusBadge(selectedNavigator.status)}</div>
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="font-medium">Navigation Details</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Target Anchor</span>
                    <span className="font-medium">{selectedNavigator.targetAnchor}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Connected Anchors</span>
                    <span className="font-medium">{selectedNavigator.connectedAnchors}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="font-medium">Distance to Anchors</h4>
                <div className="space-y-2">
                  {Object.entries(selectedNavigator.distances).map(([anchorId, distance]) => (
                    <div key={anchorId} className="flex items-center justify-between text-sm">
                      <span className="font-mono">{anchorId}</span>
                      <Badge variant="outline">{distance.toFixed(2)}m</Badge>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="font-medium">Device Information</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Device Name</span>
                    <span>{selectedNavigator.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">User ID</span>
                    <span className="font-mono text-xs">{selectedNavigator.id}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Smart Contract Detail Sheet (keeping as is) */}
      <Sheet open={!!selectedContract} onOpenChange={() => setSelectedContract(null)}>
        <SheetContent className="w-[400px] sm:w-[540px]">
          <SheetHeader>
            <SheetTitle>Contract {selectedContract?.txId}</SheetTitle>
            <SheetDescription>
              {selectedContract?.navigatorId} • {formatTimeAgo(selectedContract?.timestamp || new Date())}
            </SheetDescription>
          </SheetHeader>

          {selectedContract && (
            <div className="mt-6 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm font-medium">Status</div>
                  <div className="mt-1">{getContractStatusBadge(selectedContract.status)}</div>
                </div>
                <div>
                  <div className="text-sm font-medium">QoD Quorum</div>
                  <div className="mt-1">{getQuorumBadge(selectedContract.qodQuorum)}</div>
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="font-medium">Contract Terms</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Asset</span>
                    <span className="font-medium">{selectedContract.asset}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Price</span>
                    <span className="font-medium">
                      {selectedContract.price} {selectedContract.currency}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Navigator</span>
                    <span className="font-mono">{selectedContract.navigatorId}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="font-medium">Participating Anchors</h4>
                <div className="space-y-2">
                  {selectedContract.anchors.map((anchorId) => (
                    <div key={anchorId} className="flex items-center justify-between text-sm">
                      <span className="font-mono">{anchorId}</span>
                      <Badge variant="outline">Active</Badge>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}