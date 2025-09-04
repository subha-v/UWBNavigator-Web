# UWB Navigator Web Dashboard

Real-time web dashboard for monitoring and visualizing Ultra-Wideband (UWB) tracking data from iOS devices.

## Overview

This web application provides a real-time dashboard interface for the UWB Navigator iOS app, displaying:
- Active anchor devices and their status
- Navigator devices and their tracked distances
- Battery levels and connection states
- Distance measurements with centimeter precision
- Error tracking and analysis

## Features

- **Real-time Data Updates**: Polls iOS device API every second
- **Multi-device Tracking**: Monitor multiple anchors and navigators simultaneously
- **Distance Visualization**: Display precise UWB distance measurements
- **Battery Monitoring**: Track device battery levels
- **Connection Status**: Visual indicators for device states
- **Responsive Design**: Works on desktop and tablet displays
- **Dark Mode Support**: Built-in theme switching

## Tech Stack

- **Framework**: Next.js 14.2
- **UI Components**: shadcn/ui with Radix UI primitives
- **Styling**: Tailwind CSS
- **Charts**: Recharts for data visualization
- **Icons**: Lucide React
- **TypeScript**: Full type safety

## Prerequisites

- Node.js 18+ and npm/yarn
- iOS device running UWB Navigator app
- Same network connectivity between web dashboard and iOS device

## Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/UWBNavigator-Web.git
cd UWBNavigator-Web/uwb-navigator-web
```

2. Install dependencies:
```bash
npm install
```

3. Configure iOS device connection:
```bash
# Create .env.local file
cp .env.example .env.local

# Edit .env.local and set your iOS device IP
NEXT_PUBLIC_API_URL=http://YOUR_IPHONE_IP:8080
```

4. Start the development server:
```bash
npm run dev
```

5. Open http://localhost:3000 in your browser

## Configuration

### Finding Your iPhone's IP Address

1. On iPhone: Settings → Wi-Fi → (i) icon next to connected network
2. Look for "IP Address" under IPV4 ADDRESS section
3. Use this IP in your `.env.local` file

### Environment Variables

```env
# iOS Device API Configuration
NEXT_PUBLIC_API_URL=http://10.1.10.110:8080
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