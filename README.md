# UWB Navigator Web Dashboard

Real-time web dashboard for monitoring and visualizing Ultra-Wideband (UWB) tracking data from iOS devices with automatic Bonjour/mDNS device discovery.

## Recent Updates (December 2025)

### Smart Contract Integration & Navigation Completion
- **Navigation Completion Flow**: Added support for "Reached Destination" button in iOS app
- **Smart Contract Creation**: Automatic contract generation when navigator reaches destination
- **WebSocket Real-time Updates**: Live smart contract updates via WebSocket connection
- **Fixed WebSocket Message Handling**: Corrected message structure for navigator completion events
- **Contract Dashboard**: Display smart contracts with navigator, destination, price, and status

### Light Mode UI Overhaul
- **Clean Light Theme**: Converted from dark mode to professional light mode with white backgrounds
- **Enhanced Typography**: Increased font sizes for better readability (Agent ID: text-lg font-semibold, QoD labels: text-sm)
- **Improved Visual Design**: Reduced card heights from 100px to 80px for better aesthetics
- **Better Badge Styling**: Enhanced status and QoD badges with improved padding and typography
- **Optimized Layout**: Perfect symmetry between anchors and navigators sections
- **Corporate Branding**: Added Nisshinbo Holdings Inc. copyright notice
- **iPhone-style Battery Indicators**: Visual battery bars with color-coded status
- **San Francisco Font**: Uses SF Pro Display/Text for Apple ecosystem consistency
- **Multi-port Scanning**: Support for device discovery across multiple ports
- **Anchor-to-Anchor Connections**: Display ground truth data between anchor devices

## Overview

This web application provides a real-time dashboard interface for the UWB Navigator iOS app, displaying:
- Active anchor devices and their status
- Navigator devices and their tracked distances
- Battery levels and connection states with iPhone-style indicators
- Distance measurements with centimeter precision
- Error tracking and analysis with color-coded badges
- Anchor-to-anchor ground truth data visualization

## Features

- **Automatic Device Discovery**: iOS devices automatically discovered via FastAPI/Bonjour - no manual IP configuration
- **Real-time Data Updates**: Polls aggregated data from FastAPI server every second
- **Role-based Display**: Automatically separates anchors and navigators in appropriate columns
- **Multi-device Tracking**: Monitor unlimited anchors and navigators simultaneously
- **Distance Visualization**: Display precise UWB distance measurements
- **iPhone-style Battery Monitoring**: Visual battery bars with gradient colors
- **Connection Status**: Visual indicators for device states
- **Responsive Design**: Works on desktop and tablet displays
- **Light Mode Optimized**: Clean, professional light theme with enhanced readability

## Tech Stack

- **Framework**: Next.js 14.2
- **UI Components**: shadcn/ui with Radix UI primitives
- **Styling**: Tailwind CSS
- **Charts**: Recharts for data visualization
- **Icons**: Lucide React
- **TypeScript**: Full type safety

## Prerequisites

- Node.js 18+ and npm/yarn
- Python 3.8+ (for FastAPI server)
- iOS device(s) running UWB Navigator app
- Same WiFi network for all devices and computer
- FastAPI server running with Bonjour discovery

## Installation

1. Clone the repository:
```bash
git clone https://github.com/subha-v/UWBNavigator-Web.git
cd UWBNavigator-Web/uwb-navigator-web
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment:
```bash
cp .env.local.example .env.local
# Default configuration points to http://localhost:8000 (FastAPI server)
```

4. Start the FastAPI server (in UWBNavigator directory):
```bash
cd path/to/UWBNavigator
./start_server.sh
```

5. Start the development server:
```bash
npm run dev
```

6. Open http://localhost:3002 in your browser

## Configuration

### Automatic Device Discovery (NEW!)

Devices are now automatically discovered via Bonjour/mDNS - no manual IP configuration needed!

### Environment Variables

```env
# FastAPI Server URL (default works for local development)
NEXT_PUBLIC_FASTAPI_URL=http://localhost:8000

# Optional: WebSocket URL for real-time updates
NEXT_PUBLIC_WS_URL=ws://localhost:8000/ws
```

### Manual Device Registration (Fallback)

If Bonjour discovery isn't working, you can manually register devices:

```bash
curl -X POST "http://localhost:8000/api/register?ip=[DEVICE_IP]&port=8080"
```

## Usage

### Dashboard Panels

#### Anchors Panel
Displays anchor devices that navigators can track:
- Device ID and name
- Destination location
- Battery percentage
- Connection status (connected/disconnected)
- Number of connected navigators
- Measured distance and error metrics

#### Navigators Panel
Shows navigator devices actively tracking anchors:
- Device ID and name
- Target anchor being tracked
- Battery percentage
- Status (idle/active)
- Number of connected anchors
- Distance measurements to each anchor

### Connection States

- **🟢 Connected**: Successfully receiving data from iOS app
- **🔴 Disconnected**: Cannot reach iOS device API
- **⚠️ Error**: Connection issue or network problem

### Data Updates

- Dashboard polls iOS API every 1000ms
- All data is real-time from actual UWB measurements
- No mock or simulated data when disconnected
- Empty tables shown when no devices connected

## API Integration

The webapp connects to the iOS app's HTTP server:

### Endpoints Used

- `GET /api/status` - Device status and info
- `GET /api/anchors` - Anchor devices data
- `GET /api/navigators` - Navigator devices data
- `GET /api/distances` - Distance measurements

### Data Format

#### Anchor Data
```typescript
{
  id: string
  name: string
  destination: string
  battery: number
  status: "connected" | "disconnected"
  connectedNavigators: number
  measuredDistance?: number
  groundTruthDistance?: number
  distanceError?: number
}
```

#### Navigator Data
```typescript
{
  id: string
  name: string
  targetAnchor: string
  battery: number
  status: "idle" | "active"
  connectedAnchors: number
  distances: Record<string, number>
}
```

## Development

### Project Structure

```
uwb-navigator-web/
├── app/
│   ├── layout.tsx           # Root layout with metadata
│   ├── page.tsx            # Main dashboard component
│   └── globals.css         # Global styles
├── components/
│   └── ui/                 # shadcn/ui components
├── lib/
│   └── utils.ts           # Utility functions
├── public/                # Static assets
└── .env.local            # Environment configuration
```

### Available Scripts

```bash
# Development
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Run linting
npm run lint
```

## Troubleshooting

### "Disconnected" Status
- Verify iPhone and computer are on same network
- Check iPhone's IP address hasn't changed
- Ensure UWB Navigator iOS app is running
- Confirm API server started (check iOS app logs)

### No Data Showing
- iOS app must be in Anchor or Navigator mode
- Wait for devices to establish UWB connections
- Check browser console for error messages

### CORS Errors
- API server includes CORS headers by default
- If issues persist, check network firewall settings

## Deployment

### Vercel Deployment

1. Push code to GitHub
2. Import project in Vercel
3. Set environment variable for production iOS device
4. Deploy

### Self-Hosting

1. Build the production bundle:
```bash
npm run build
```

2. Start the production server:
```bash
npm start
```

3. Configure reverse proxy (nginx/Apache) if needed

## Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit changes (`git commit -m 'Add AmazingFeature'`)
4. Push to branch (`git push origin feature/AmazingFeature`)
5. Open Pull Request

## License

MIT License - see LICENSE file for details

## Related Projects

- [UWB Navigator iOS App](https://github.com/subha-v/UWBNavigator) - The iOS app that provides the tracking data

## Support

For issues or questions, please open an issue on GitHub.