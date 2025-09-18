import { NextResponse } from 'next/server'

// Store updates in memory (in production, use a database or Redis)
let navigatorUpdates: any[] = []
let smartContracts: any[] = []

export async function POST(req: Request) {
    try {
        const data = await req.json()

        // Check if this is a navigator completion
        if (data.type === 'navigator_completed') {
            console.log('🎯 Received navigator completion:', {
                navigator_id: data.navigator_id,
                navigator_name: data.navigator_name,
                anchor_destination: data.anchor_destination,
                timestamp: data.timestamp
            })

            // Store the contract if provided
            if (data.contract) {
                smartContracts.push({
                    ...data.contract,
                    timestamp: new Date(data.timestamp || Date.now())
                })

                // Keep only last 100 contracts
                if (smartContracts.length > 100) {
                    smartContracts = smartContracts.slice(-100)
                }
            }

            return NextResponse.json({
                success: true,
                message: 'Navigator completion recorded',
                contract: data.contract
            })
        } else {
            // Regular navigator update
            console.log('📡 Received navigator update:', {
                navigator_id: data.navigator_id,
                navigator_name: data.navigator_name,
                similarity_score: data.similarity_score,
                location: data.location,
                timestamp: new Date().toISOString()
            })

            // Store the update
            navigatorUpdates.push({
                ...data,
                timestamp: new Date().toISOString()
            })

            // Keep only last 50 updates
            if (navigatorUpdates.length > 50) {
                navigatorUpdates = navigatorUpdates.slice(-50)
            }

            return NextResponse.json({
                success: true,
                message: 'Navigator update received',
                data: {
                    navigator_id: data.navigator_id,
                    similarity_score: data.similarity_score
                }
            })
        }
    } catch (error) {
        console.error('❌ Error processing navigator update:', error)
        return NextResponse.json(
            { success: false, error: 'Failed to process update' },
            { status: 500 }
        )
    }
}

// Optional: GET endpoint to retrieve recent updates
export async function GET() {
    return NextResponse.json({
        updates: navigatorUpdates,
        contracts: smartContracts,
        count: navigatorUpdates.length
    })
}