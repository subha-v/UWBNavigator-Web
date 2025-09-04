"use client"

import { useState, useEffect } from "react"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { TrendingUp, TrendingDown, Clock, CheckCircle, XCircle, Loader } from "lucide-react"

interface Anchor {
  id: string
  floor: string
  qod: number
  residualP95: number
  jitterP95: number
  uwbHz: number
  dropouts: number
  geometryScore: number
  status: "healthy" | "warning" | "poor" | "quarantined"
  lastCalibration: string
  firmware: string
  coords: { x: number; y: number; z: number }
  battery: number
}

interface Robot {
  id: string
  intent: string
  destination: string
  routeEta: number // seconds
  currentFloor: string
  positionConfidence: number
  anchorsUsed: number
  anchorsExcluded: number
  guardianState: "Normal" | "Degraded" | "Failsafe"
  status: "active" | "idle" | "error"
  lastPosition: { x: number; y: number }
  batteryLevel: number
  qodScore: number // 0-100 percentage
  photoSimilarity: number
}

// Added SmartContract interface and mock data
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

const mockContracts: SmartContract[] = [
  {
    txId: "0xa7b2c9d4",
    navigatorId: "Akshata",
    anchors: ["Kitchen", "Meeting Room", "Lobby"],
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
    navigatorId: "Akshata",
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
    robotId: "Akshata",
  },
]

const mockAnchors: Anchor[] = [
  {
    id: "Kitchen",
    floor: "Floor 2",
    qod: 85,
    battery: 92,
    status: "healthy" as const,
    residualP95: 0.15,
    jitterP95: 2.3,
    uwbHz: 120,
    dropouts: 0.8,
    geometryScore: 8.7,
    lastCalibration: "2024-01-15",
    firmware: "v2.1.3",
    coords: { x: 12.5, y: 8.2, z: 3.1 },
  },
  {
    id: "Window",
    floor: "Floor 2",
    qod: 45,
    battery: 78,
    status: "poor" as const,
    residualP95: 0.28,
    jitterP95: 4.1,
    uwbHz: 115,
    dropouts: 2.3,
    geometryScore: 6.2,
    lastCalibration: "2024-01-12",
    firmware: "v2.1.2",
    coords: { x: 5.1, y: 12.8, z: 3.1 },
  },
  {
    id: "Meeting Room",
    floor: "Floor 1",
    qod: 92,
    battery: 88,
    status: "healthy" as const,
    residualP95: 0.18,
    jitterP95: 3.2,
    uwbHz: 118,
    dropouts: 1.2,
    geometryScore: 7.8,
    lastCalibration: "2024-01-14",
    firmware: "v2.1.3",
    coords: { x: 18.3, y: 6.7, z: 3.1 },
  },
  {
    id: "Lobby",
    floor: "Floor 1",
    qod: 88,
    battery: 95,
    status: "healthy" as const,
    residualP95: 0.22,
    jitterP95: 3.8,
    uwbHz: 112,
    dropouts: 1.8,
    geometryScore: 6.9,
    lastCalibration: "2024-01-13",
    firmware: "v2.1.2",
    coords: { x: 9.8, y: 15.2, z: 3.1 },
  },
]

const mockRobots: Robot[] = [
  {
    id: "Akshata",
    intent: "To Docking Station A",
    routeEta: 125,
    currentFloor: "Floor 1",
    qodScore: 88,
    positionConfidence: 0.94,
    anchorsUsed: 3,
    anchorsExcluded: 1,
    guardianState: "Normal",
    status: "active",
    lastPosition: { x: 8.3, y: 12.1 },
    batteryLevel: 87,
    qod: 88,
    photoSimilarity: 94,
    destination: "Docking Station A",
  },
]

function getQoDBadge(qod: number) {
  if (qod >= 80)
    return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">{qod}%</Badge>
  if (qod >= 50)
    return <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">{qod}%</Badge>
  return <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">{qod}%</Badge>
}

function getConfidenceBadge(confidence: number) {
  if (confidence >= 0.8)
    return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">High</Badge>
  if (confidence >= 0.6)
    return <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">Med</Badge>
  return <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">Low</Badge>
}

function getGuardianStateBadge(state: string) {
  if (state === "Normal")
    return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">Normal</Badge>
  if (state === "Degraded")
    return <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">Degraded</Badge>
  return <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">Failsafe</Badge>
}

// Added contract status and quorum badge functions
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

function formatETA(seconds: number) {
  if (seconds === 0) return "0:00"
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`
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
  const [connectionStatus, setConnectionStatus] = useState<"connected" | "disconnected" | "degraded">("connected")
  const [globalAlert, setGlobalAlert] = useState("")

  const [anchors, setAnchors] = useState<Anchor[]>(mockAnchors)
  const [anchorSearch, setAnchorSearch] = useState("")
  const [floorFilter, setFloorFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState("all")
  const [selectedAnchor, setSelectedAnchor] = useState<Anchor | null>(null)

  const [robots, setRobots] = useState<Robot[]>(mockRobots)
  const [robotSearch, setRobotSearch] = useState("")
  const [robotFloorFilter, setRobotFloorFilter] = useState("all")
  const [robotStateFilter, setRobotStateFilter] = useState("all")
  const [selectedRobot, setSelectedRobot] = useState<Robot | null>(null)

  const [contracts, setContracts] = useState<SmartContract[]>(mockContracts)
  const [contractSearch, setContractSearch] = useState("")
  const [contractStatusFilter, setContractStatusFilter] = useState("all")
  const [selectedContract, setSelectedContract] = useState<SmartContract | null>(null)

  // Added cross-panel highlighting state
  const [highlightedAnchor, setHighlightedAnchor] = useState<string | null>(null)
  const [highlightedRobot, setHighlightedRobot] = useState<string | null>(null)
  const [highlightedContracts, setHighlightedContracts] = useState<string[]>([])

  // Added functions for cross-panel interactions
  const handleAnchorClick = (anchorId: string) => {
    setHighlightedAnchor(anchorId)
    // Find robots using this anchor (simplified logic - in real app would check actual anchor usage)
    const robotsUsingAnchor = robots.filter(
      (robot) => robot.status === "active" && Math.random() > 0.5, // Mock logic
    )
    setHighlightedContracts(contracts.filter((c) => c.anchors.includes(anchorId)).map((c) => c.txId))

    // Clear highlights after 3 seconds
    setTimeout(() => {
      setHighlightedAnchor(null)
      setHighlightedContracts([])
    }, 3000)
  }

  const handleRobotClick = (robotId: string) => {
    setHighlightedRobot(robotId)
    // Find contracts triggered by this robot
    const robotContracts = contracts.filter((c) => c.robotId === robotId)
    setHighlightedContracts(robotContracts.map((c) => c.txId))

    // Clear highlights after 3 seconds
    setTimeout(() => {
      setHighlightedRobot(null)
      setHighlightedContracts([])
    }, 3000)
  }

  const filteredAnchors = anchors.filter((anchor) => {
    const matchesSearch =
      anchor.id.toLowerCase().includes(anchorSearch.toLowerCase()) ||
      anchor.floor.toLowerCase().includes(anchorSearch.toLowerCase())
    const matchesFloor = floorFilter === "all" || anchor.floor === floorFilter
    const matchesStatus = statusFilter === "all" || anchor.status === statusFilter
    return matchesSearch && matchesFloor && matchesStatus
  })

  const filteredRobots = robots.filter((robot) => {
    const matchesSearch =
      robot.id.toLowerCase().includes(robotSearch.toLowerCase()) ||
      robot.intent.toLowerCase().includes(robotSearch.toLowerCase()) ||
      robot.destination.toLowerCase().includes(robotSearch.toLowerCase())
    const matchesFloor = robotFloorFilter === "all" || robot.currentFloor === robotFloorFilter
    const matchesState = robotStateFilter === "all" || robot.guardianState === robotStateFilter
    return matchesSearch && matchesFloor && matchesState
  })

  // Added contract filtering logic
  const filteredContracts = contracts.filter((contract) => {
    const matchesSearch =
      contract.txId.toLowerCase().includes(contractSearch.toLowerCase()) ||
      contract.robotId.toLowerCase().includes(contractSearch.toLowerCase()) ||
      contract.asset.toLowerCase().includes(contractSearch.toLowerCase())
    const matchesStatus = contractStatusFilter === "all" || contract.status === contractStatusFilter
    return matchesSearch && matchesStatus
  })

  // Enhanced real-time updates with more dynamic data
  useEffect(() => {
    const interval = setInterval(() => {
      setLastUpdated(new Date())

      // Update robot ETAs in real-time
      setRobots((prevRobots) =>
        prevRobots.map((robot) => ({
          ...robot,
          routeEta: robot.status === "active" && robot.routeEta > 0 ? Math.max(0, robot.routeEta - 5) : robot.routeEta,
        })),
      )

      // Simulate contract status changes
      setContracts((prevContracts) =>
        prevContracts.map((contract) => {
          if (contract.status === "Pending" && Math.random() > 0.9) {
            return { ...contract, status: "Executing" as const }
          }
          if (contract.status === "Executing" && Math.random() > 0.95) {
            return { ...contract, status: Math.random() > 0.8 ? ("Settled" as const) : ("Failed" as const) }
          }
          return contract
        }),
      )

      // Simulate anchor QoD fluctuations
      setAnchors((prevAnchors) =>
        prevAnchors.map((anchor) => {
          if (anchor.status !== "quarantined" && Math.random() > 0.9) {
            const qodChange = (Math.random() - 0.5) * 0.1
            const newQod = Math.max(0, Math.min(1, anchor.qod + qodChange))
            return { ...anchor, qod: newQod }
          }
          return anchor
        }),
      )

      // Simulate connection status changes
      if (Math.random() > 0.98) {
        setConnectionStatus((prev) => (prev === "connected" ? "degraded" : "connected"))
      }
    }, 5000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex h-14 items-center px-4">
          <div className="flex items-center space-x-4">
            <h1 className="text-xl font-semibold">Guardian Console</h1>
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
                <div className="h-2 w-2 rounded-full bg-green-500"></div>
                <span>Live</span>
              </div>
              <span>•</span>
              <span>Updated {formatTimeAgo(new Date())}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Three Panel Layout */}
      <div className="flex h-[calc(100vh-120px)] gap-4 p-6">
        {/* Left Panel - Anchors & QoD (30%) */}
        <div className="flex-1 border-r">
          <div className="border-b p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Anchors</h2>
              <div className="flex items-center space-x-2">
                <Input
                  placeholder="Search anchors..."
                  value={anchorSearch}
                  onChange={(e) => setAnchorSearch(e.target.value)}
                  className="w-40"
                />
                <Select value={floorFilter} onValueChange={setFloorFilter}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Floors</SelectItem>
                    <SelectItem value="Floor 1">Floor 1</SelectItem>
                    <SelectItem value="Floor 2">Floor 2</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="p-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">Agent ID</TableHead>
                  <TableHead className="w-20">QoD Score</TableHead>
                  <TableHead className="w-20">Battery</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAnchors.map((anchor) => (
                  <TableRow
                    key={anchor.id}
                    className={`cursor-pointer transition-colors ${
                      highlightedAnchor === anchor.id ? "bg-blue-50 dark:bg-blue-950/20" : ""
                    }`}
                    onClick={() => handleAnchorClick(anchor.id)}
                  >
                    <TableCell className="font-mono">{anchor.id}</TableCell>
                    <TableCell>{getQoDBadge(anchor.qod)}</TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-1">
                        <span className="text-sm">{anchor.battery}%</span>
                        <div
                          className={`h-2 w-8 rounded-full ${
                            anchor.battery > 80 ? "bg-green-500" : anchor.battery > 50 ? "bg-amber-500" : "bg-red-500"
                          }`}
                        >
                          <div className="h-full rounded-full bg-white/30" style={{ width: `${anchor.battery}%` }} />
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Middle Panel - Robots (40%) */}
        <div className="flex-[1.33] border-r">
          <div className="border-b p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Navigators</h2>
              <div className="flex items-center space-x-2">
                <Input
                  placeholder="Search navigators..."
                  value={robotSearch}
                  onChange={(e) => setRobotSearch(e.target.value)}
                  className="w-40"
                />
              </div>
            </div>
          </div>

          <div className="p-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">Agent ID</TableHead>
                  <TableHead className="w-20">QoD Score</TableHead>
                  <TableHead className="w-24">Time to Destination</TableHead>
                  <TableHead className="w-24">Photo Similarity (%)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRobots.map((robot) => (
                  <TableRow
                    key={robot.id}
                    className={`cursor-pointer transition-colors ${
                      highlightedRobot === robot.id ? "bg-blue-50 dark:bg-blue-950/20" : ""
                    }`}
                    onClick={() => handleRobotClick(robot.id)}
                  >
                    <TableCell className="font-mono">{robot.id}</TableCell>
                    <TableCell>{getQoDBadge(robot.qod)}</TableCell>
                    <TableCell className="font-mono">{formatETA(robot.routeEta)}</TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-1">
                        <span className="text-sm">{robot.photoSimilarity}%</span>
                        <Badge
                          variant={
                            robot.photoSimilarity > 90
                              ? "default"
                              : robot.photoSimilarity > 70
                                ? "secondary"
                                : "destructive"
                          }
                          className="text-xs"
                        >
                          {robot.photoSimilarity > 90 ? "High" : robot.photoSimilarity > 70 ? "Med" : "Low"}
                        </Badge>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
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
                  <TableHead className="w-20">Tx ID</TableHead>
                  <TableHead className="w-20">Navigator</TableHead>
                  <TableHead className="w-16">Price</TableHead>
                  <TableHead className="w-20">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredContracts.map((contract) => (
                  <TableRow
                    key={contract.txId}
                    className="cursor-pointer"
                    onClick={() => setSelectedContract(contract)}
                  >
                    <TableCell className="font-mono">{contract.txId}</TableCell>
                    <TableCell className="font-mono">{contract.navigatorId}</TableCell>
                    <TableCell>
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

      {/* Added smart contract detail drawer */}
      <Sheet open={!!selectedContract} onOpenChange={() => setSelectedContract(null)}>
        <SheetContent className="w-[400px] sm:w-[540px]">
          <SheetHeader>
            <SheetTitle>Contract {selectedContract?.txId}</SheetTitle>
            <SheetDescription>
              {selectedContract?.navigatorId} • {selectedContract?.asset} •{" "}
              {formatTimeAgo(selectedContract?.timestamp || new Date())}
            </SheetDescription>
          </SheetHeader>

          {selectedContract && (
            <div className="mt-6 space-y-6">
              {/* Contract Status */}
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

              {/* Contract Terms */}
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
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Anchors Required</span>
                    <span>{selectedContract.minAnchors} min</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Anchors Used</span>
                    <span>{selectedContract.actualAnchors}</span>
                  </div>
                </div>
              </div>

              {/* Anchor List */}
              <div className="space-y-3">
                <h4 className="font-medium">Participating Anchors</h4>
                <div className="space-y-2">
                  {selectedContract.anchors.map((anchorId, index) => (
                    <div key={anchorId} className="flex items-center justify-between text-sm">
                      <span className="font-mono">{anchorId}</span>
                      <Badge variant="outline" className="text-xs">
                        QoD: 0.{Math.floor(Math.random() * 40 + 60)}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>

              {/* Proof Bundle */}
              <div className="space-y-3">
                <h4 className="font-medium">Proof Bundle</h4>
                <div className="space-y-2 text-sm font-mono bg-muted/20 p-3 rounded">
                  <div>DOP: {selectedContract.dop.toFixed(1)}m</div>
                  <div>
                    Signature: 0x{Math.random().toString(16).substr(2, 8)}...{Math.random().toString(16).substr(2, 4)}
                  </div>
                  <div>HMAC: {Math.random().toString(16).substr(2, 16)}</div>
                  <div>Timestamp: {selectedContract.timestamp.toISOString()}</div>
                </div>
              </div>

              {/* Event Timeline */}
              <div className="space-y-3">
                <h4 className="font-medium">Event Timeline</h4>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <div className="h-2 w-2 rounded-full bg-blue-500"></div>
                    <span>Contract initialized - {formatTimeAgo(selectedContract.timestamp)}</span>
                  </div>
                  {selectedContract.status !== "Pending" && (
                    <div className="flex items-center gap-2 text-sm">
                      <div className="h-2 w-2 rounded-full bg-amber-500"></div>
                      <span>
                        Escrow locked - {formatTimeAgo(new Date(selectedContract.timestamp.getTime() + 10000))}
                      </span>
                    </div>
                  )}
                  {selectedContract.status === "Settled" && (
                    <div className="flex items-center gap-2 text-sm">
                      <div className="h-2 w-2 rounded-full bg-green-500"></div>
                      <span>
                        Payment released - {formatTimeAgo(new Date(selectedContract.timestamp.getTime() + 30000))}
                      </span>
                    </div>
                  )}
                  {selectedContract.status === "Failed" && (
                    <div className="flex items-center gap-2 text-sm">
                      <div className="h-2 w-2 rounded-full bg-red-500"></div>
                      <span>Contract failed - quorum not met</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <Sheet open={!!selectedRobot} onOpenChange={() => setSelectedRobot(null)}>
        <SheetContent className="w-[400px] sm:w-[540px]">
          <SheetHeader>
            <SheetTitle>Robot {selectedRobot?.id}</SheetTitle>
            <SheetDescription>
              {selectedRobot?.currentFloor} • {selectedRobot?.intent} • Battery: {selectedRobot?.batteryLevel}%
            </SheetDescription>
          </SheetHeader>

          {selectedRobot && (
            <div className="mt-6 space-y-6">
              {/* Navigation Status */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm font-medium">Position Confidence</div>
                  <div className="flex items-center gap-2 mt-1">
                    {getConfidenceBadge(selectedRobot.positionConfidence)}
                    <span className="text-lg font-mono">{(selectedRobot.positionConfidence * 100).toFixed(1)}%</span>
                  </div>
                </div>
                <div>
                  <div className="text-sm font-medium">Guardian State</div>
                  <div className="mt-1">{getGuardianStateBadge(selectedRobot.guardianState)}</div>
                </div>
              </div>

              {/* Current Mission */}
              <div className="space-y-3">
                <h4 className="font-medium">Current Mission</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Intent</span>
                    <span className="font-medium">{selectedRobot.intent}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Destination</span>
                    <span className="font-medium">{selectedRobot.destination}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">ETA</span>
                    <span className="font-mono">{formatETA(selectedRobot.routeEta)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Last Position</span>
                    <span className="font-mono">
                      ({selectedRobot.lastPosition.x.toFixed(1)}, {selectedRobot.lastPosition.y.toFixed(1)})
                    </span>
                  </div>
                </div>
              </div>

              {/* Anchor Usage */}
              <div className="space-y-3">
                <h4 className="font-medium">Anchor Usage</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-muted-foreground">Anchors Used</div>
                    <div className="text-lg font-bold text-green-600">{selectedRobot.anchorsUsed}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Anchors Excluded</div>
                    <div className="text-lg font-bold text-red-600">{selectedRobot.anchorsExcluded}</div>
                  </div>
                </div>
              </div>

              {/* Navigation Timeline */}
              <div className="space-y-3">
                <h4 className="font-medium">Navigation Timeline</h4>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <div className="h-2 w-2 rounded-full bg-green-500"></div>
                    <span>Mission started - 2 min ago</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <div className="h-2 w-2 rounded-full bg-amber-500"></div>
                    <span>Anchor F1-A5 excluded due to poor QoD - 1 min ago</span>
                  </div>
                  {selectedRobot.guardianState === "Degraded" && (
                    <div className="flex items-center gap-2 text-sm">
                      <div className="h-2 w-2 rounded-full bg-red-500"></div>
                      <span>Guardian state degraded - 30 sec ago</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Path Segments */}
              <div className="space-y-3">
                <h4 className="font-medium">Current Path Segments</h4>
                <div className="h-24 rounded border bg-muted/20 flex items-center justify-center text-sm text-muted-foreground">
                  Path visualization and next instruction
                </div>
              </div>

              {/* Attestation Preview */}
              <div className="space-y-3">
                <h4 className="font-medium">Attestation Preview</h4>
                <div className="space-y-2 text-sm font-mono bg-muted/20 p-3 rounded">
                  <div>Hash: 0x4a7b...c9d2</div>
                  <div>DOP: 2.3m</div>
                  <div>Anchors: {selectedRobot.anchorsUsed} active</div>
                  <div>Avg QoD: 0.{Math.floor(Math.random() * 40 + 60)}</div>
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <Sheet open={!!selectedAnchor} onOpenChange={() => setSelectedAnchor(null)}>
        <SheetContent className="w-[400px] sm:w-[540px]">
          <SheetHeader>
            <SheetTitle>Anchor {selectedAnchor?.id}</SheetTitle>
            <SheetDescription>
              {selectedAnchor?.floor} • Last calibrated {selectedAnchor?.lastCalibration}
            </SheetDescription>
          </SheetHeader>

          {selectedAnchor && (
            <div className="mt-6 space-y-6">
              {/* Status Overview */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm font-medium">Quality of Data</div>
                  <div className="flex items-center gap-2 mt-1">
                    {getQoDBadge(selectedAnchor.qod)}
                    <span className="text-lg font-mono">{(selectedAnchor.qod * 100).toFixed(1)}%</span>
                  </div>
                </div>
                <div>
                  <div className="text-sm font-medium">Geometry Score</div>
                  <div className="flex items-center gap-1 mt-1">
                    <span className="text-lg font-mono">{selectedAnchor.geometryScore.toFixed(1)}</span>
                    {selectedAnchor.geometryScore > 7 ? (
                      <TrendingUp className="h-4 w-4 text-green-500" />
                    ) : (
                      <TrendingDown className="h-4 w-4 text-red-500" />
                    )}
                  </div>
                </div>
              </div>

              {/* Performance Metrics */}
              <div className="space-y-3">
                <h4 className="font-medium">Performance Metrics</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-muted-foreground">Residual p95</div>
                    <div className="font-mono">{selectedAnchor.residualP95.toFixed(2)}m</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Jitter p95</div>
                    <div className="font-mono">{selectedAnchor.jitterP95.toFixed(1)}cm</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">UWB Rate</div>
                    <div className="font-mono">{selectedAnchor.uwbHz}Hz</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Dropouts</div>
                    <div className="font-mono">{selectedAnchor.dropouts.toFixed(1)}%</div>
                  </div>
                </div>
              </div>

              {/* Anchor Metadata */}
              <div className="space-y-3">
                <h4 className="font-medium">Anchor Metadata</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Coordinates</span>
                    <span className="font-mono">
                      ({selectedAnchor.coords.x}, {selectedAnchor.coords.y}, {selectedAnchor.coords.z})
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Firmware</span>
                    <span className="font-mono">{selectedAnchor.firmware}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Last Calibration</span>
                    <span>{selectedAnchor.lastCalibration}</span>
                  </div>
                </div>
              </div>

              {/* Sparkline Placeholder */}
              <div className="space-y-3">
                <h4 className="font-medium">Performance Trends (15 min)</h4>
                <div className="h-24 rounded border bg-muted/20 flex items-center justify-center text-sm text-muted-foreground">
                  Sparkline charts: QoD, Residual, Jitter
                </div>
              </div>

              {/* Recent Incidents */}
              <div className="space-y-3">
                <h4 className="font-medium">Recent Incidents</h4>
                <div className="space-y-2">
                  {selectedAnchor.status === "poor" && (
                    <div className="flex items-center gap-2 text-sm">
                      <div className="h-2 w-2 rounded-full bg-red-500"></div>
                      <span>High jitter detected 3 min ago</span>
                    </div>
                  )}
                  {selectedAnchor.status === "warning" && (
                    <div className="flex items-center gap-2 text-sm">
                      <div className="h-2 w-2 rounded-full bg-amber-500"></div>
                      <span>QoD below threshold 8 min ago</span>
                    </div>
                  )}
                  {selectedAnchor.status === "healthy" && (
                    <div className="text-sm text-muted-foreground">No recent incidents</div>
                  )}
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
