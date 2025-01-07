"use client";

import { useEffect, useRef, useState } from "react";

export default function ReceiverClient() {
    const [isConnected, setIsConnected] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const wsRef = useRef<WebSocket | null>(null);
    // const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const [isMounted, setIsMounted] = useState(false);
    const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
    const reconnectAttemptsRef = useRef(0);
    const MAX_RECONNECT_ATTEMPTS = 5;
    const [isAudioInitialized, setIsAudioInitialized] = useState(false);

    useEffect(() => {
        setIsMounted(true);
    }, []);

    useEffect(() => {
        if (!isMounted || !isAudioInitialized) return;

        console.log("Starting WebSocket connection with audio initialized");
        const ws = connectWebSocket();

        return () => {
            if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current);
            }
            wsRef.current?.close();
        };
    }, [isMounted, isAudioInitialized]); // Add isAudioInitialized as dependency

    const initializeAudio = async () => {
        try {
            console.log("Initializing audio context...");
            const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
            audioContextRef.current = audioContext;

            if (audioContext.state === "suspended") {
                console.log("Resuming suspended audio context...");
                await audioContext.resume();
            }

            console.log("Audio context initialized successfully:", audioContext.state);
            setIsAudioInitialized(true);
            setError(null);
            return true;
        } catch (err) {
            console.error("Audio initialization error:", err);
            setError(`Audio initialization error: ${err instanceof Error ? err.message : String(err)}`);
            return false;
        }
    };

    const connectWebSocket = () => {
        try {
            console.log("Connecting to WebSocket server...");
            const ws = new WebSocket(`ws://${process.env.NEXT_PUBLIC_WS_SERVER}`);
            ws.binaryType = "arraybuffer";
            wsRef.current = ws;

            ws.onopen = () => {
                console.log("WebSocket connected successfully");
                setIsConnected(true);
                setError(null);
                reconnectAttemptsRef.current = 0;
            };

            ws.onclose = () => {
                console.log("WebSocket connection closed");
                setIsConnected(false);
                reconnectWebSocket();
            };

            ws.onerror = (error) => {
                console.error("WebSocket error:", error);
                setError("WebSocket connection error. Attempting to reconnect...");
            };

            ws.onmessage = async (event) => {
                if (!audioContextRef.current || !isAudioInitialized) {
                    console.log("Skipping audio chunk - not initialized");
                    return;
                }

                try {
                    const floatArray = new Float32Array(event.data);
                    const buffer = audioContextRef.current.createBuffer(1, floatArray.length, 44100);
                    buffer.copyToChannel(floatArray, 0);

                    const source = audioContextRef.current.createBufferSource();
                    source.buffer = buffer;
                    source.connect(audioContextRef.current.destination);
                    source.start(0);
                    console.log("Playing audio chunk:", buffer.duration.toFixed(2), "seconds");
                } catch (error) {
                    console.error("Audio processing error:", error);
                    setError(`Audio processing error: ${error instanceof Error ? error.message : String(error)}`);
                }
            };

            return ws;
        } catch (error) {
            console.error("WebSocket connection error:", error);
            setError("Failed to connect to WebSocket server");
            return null;
        }
    };

    const reconnectWebSocket = () => {
        if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
            setError("Maximum reconnection attempts reached. Please refresh the page.");
            return;
        }

        reconnectAttemptsRef.current++;
        console.log(`Reconnecting... Attempt ${reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS}`);

        if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
        }

        reconnectTimeoutRef.current = setTimeout(() => {
            const ws = connectWebSocket();
            if (!ws) reconnectWebSocket();
        }, 2000); // Reconnect after 2 seconds
    };

    if (!isMounted) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center gap-4">
                <h1 className="text-2xl font-bold mb-4">Audio Receiver</h1>
                <div className="text-sm text-gray-600">Initializing...</div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex flex-col items-center justify-center gap-4">
            <h1 className="text-2xl font-bold mb-4">Audio Receiver</h1>
            {!isAudioInitialized && (
                <button
                    onClick={initializeAudio}
                    className="px-6 py-3 rounded-full bg-blue-500 hover:bg-blue-600 text-white transition-colors mb-4">
                    Initialize Audio
                </button>
            )}
            <div className={`text-sm ${isConnected ? "text-green-600" : "text-yellow-600"}`}>
                Status: {isConnected ? "Connected" : "Disconnected"}
            </div>
            {error && <div className="text-sm text-red-600">Error: {error}</div>}
            <div className="text-sm text-gray-600">
                {!isAudioInitialized
                    ? "Click Initialize Audio to start"
                    : isConnected
                    ? "Listening for audio stream..."
                    : "Attempting to connect..."}
            </div>
        </div>
    );
}
