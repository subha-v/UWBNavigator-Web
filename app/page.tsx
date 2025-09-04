"use client"

import { useState, useEffect } from "react"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Clock, CheckCircle, XCircle, Loader, Battery, Wifi, WifiOff } from "lucide-react"

// Simplified interfaces to match actual iOS data
interface Anchor {
  id: string           // UserSession.userId
  name: string         // UserSession.displayName or device name
  destination: string  // AnchorDestination (Window/Kitchen/Meeting Room)
  battery: number      // UIDevice.current.batteryLevel * 100
  status: "connected" | "disconnected"
  connectedNavigators: number // Count of connected navigators
  measuredDistance?: number   // From DistanceErrorTracker
  groundTruthDistance?: number // From DistanceErrorTracker
  distanceError?: number      // Calculated error
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

// API configuration
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://192.168.1.100:8080'

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
  return <Badge className="bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200">{status}</Badge>
}

function getBatteryIcon(level: number) {
  if (level > 80) return <Battery className="w-4 h-4 text-green-500 fill-green-500" />
  if (level > 50) return <Battery className="w-4 h-4 text-amber-500 fill-amber-500" />
  if (level > 20) return <Battery className="w-4 h-4 text-orange-500 fill-orange-500" />
  return <Battery className="w-4 h-4 text-red-500 fill-red-500" />
}

function getDistanceErrorBadge(error?: number) {
  if (error === undefined) return <Badge variant="outline">--</Badge>
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

  const [navigators, setNavigators] = useState<Navigator[]>([])
  const [navigatorSearch, setNavigatorSearch] = useState("")
  const [selectedNavigator, setSelectedNavigator] = useState<Navigator | null>(null)

  const [contracts, setContracts] = useState<SmartContract[]>(mockContracts)
  const [contractSearch, setContractSearch] = useState("")
  const [contractStatusFilter, setContractStatusFilter] = useState("all")
  const [selectedContract, setSelectedContract] = useState<SmartContract | null>(null)

  // Fetch data from iOS app
  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch anchors data
        const anchorsRes = await fetch(`${API_URL}/api/anchors`)
        if (anchorsRes.ok) {
          const anchorsData = await anchorsRes.json()
          setAnchors(anchorsData)
          setConnectionStatus("connected")
        }

        // Fetch navigators data
        const navigatorsRes = await fetch(`${API_URL}/api/navigators`)
        if (navigatorsRes.ok) {
          const navigatorsData = await navigatorsRes.json()
          setNavigators(navigatorsData)
        }

        setLastUpdated(new Date())
      } catch (error) {
        console.error('Failed to fetch data:', error)
        setConnectionStatus("error")
        
        // Use mock data when can't connect
        setAnchors([
          {
            id: "akshata@valuenex.com",
            name: "Akshata's iPhone",
            destination: "Kitchen",
            battery: 92,
            status: "connected",
            connectedNavigators: 1,
            measuredDistance: 2.5,
            groundTruthDistance: 2.3,
            distanceError: 0.2
          },
          {
            id: "elena@valuenex.com",
            name: "Elena's iPhone",
            destination: "Meeting Room",
            battery: 88,
            status: "connected",
            connectedNavigators: 1,
            measuredDistance: 3.1,
            groundTruthDistance: 3.0,
            distanceError: 0.1
          },
          {
            id: "subhavee1@gmail.com",
            name: "Subha's iPhone",
            destination: "Window",
            battery: 95,
            status: "disconnected",
            connectedNavigators: 0
          }
        ])
        
        setNavigators([
          {
            id: "navigator1@test.com",
            name: "Navigator iPhone",
            targetAnchor: "Kitchen",
            battery: 78,
            status: "active",
            connectedAnchors: 2,
            distances: {
              "Kitchen": 2.5,
              "Meeting Room": 3.1
            }
          }
        ])
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
      anchor.id.toLowerCase().includes(anchorSearch.toLowerCase()) ||
      anchor.name.toLowerCase().includes(anchorSearch.toLowerCase()) ||
      anchor.destination.toLowerCase().includes(anchorSearch.toLowerCase())
    return matchesSearch
  })

  const filteredNavigators = navigators.filter((navigator) => {
    const matchesSearch =
      navigator.id.toLowerCase().includes(navigatorSearch.toLowerCase()) ||
      navigator.name.toLowerCase().includes(navigatorSearch.toLowerCase()) ||
      navigator.targetAnchor.toLowerCase().includes(navigatorSearch.toLowerCase())
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
                  <TableHead>Battery</TableHead>
                  <TableHead>Error</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAnchors.map((anchor) => (
                  <TableRow
                    key={anchor.id}
                    className="cursor-pointer transition-colors hover:bg-muted/50"
                    onClick={() => setSelectedAnchor(anchor)}
                  >
                    <TableCell className="font-mono text-xs">{anchor.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{anchor.destination}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-1">
                        {getBatteryIcon(anchor.battery)}
                        <span className="text-sm">{anchor.battery}%</span>
                      </div>
                    </TableCell>
                    <TableCell>{getDistanceErrorBadge(anchor.distanceError)}</TableCell>
                    <TableCell>{getStatusBadge(anchor.status)}</TableCell>
                  </TableRow>
                ))}
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
                  <TableHead>Battery</TableHead>
                  <TableHead>Anchors</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredNavigators.map((navigator) => (
                  <TableRow
                    key={navigator.id}
                    className="cursor-pointer transition-colors hover:bg-muted/50"
                    onClick={() => setSelectedNavigator(navigator)}
                  >
                    <TableCell className="font-mono text-xs">{navigator.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{navigator.targetAnchor}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-1">
                        {getBatteryIcon(navigator.battery)}
                        <span className="text-sm">{navigator.battery}%</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{navigator.connectedAnchors}</Badge>
                    </TableCell>
                    <TableCell>{getStatusBadge(navigator.status)}</TableCell>
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

              <div className="space-y-3">
                <h4 className="font-medium">Distance Measurements</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Measured Distance</span>
                    <span className="font-mono">{selectedAnchor.measuredDistance?.toFixed(2) || "--"} m</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Ground Truth</span>
                    <span className="font-mono">{selectedAnchor.groundTruthDistance?.toFixed(2) || "--"} m</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Distance Error</span>
                    {getDistanceErrorBadge(selectedAnchor.distanceError)}
                  </div>
                </div>
              </div>

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