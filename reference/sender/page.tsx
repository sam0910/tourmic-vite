"use client";

import { useEffect, useRef, useState } from "react";

export default function SenderPage() {
    const [isRecording, setIsRecording] = useState(false);
    const [wsConnection, setWsConnection] = useState<WebSocket | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [permissionStatus, setPermissionStatus] = useState<string>("prompt");
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);

    useEffect(() => {
        // Add check for insecure origin
        if (window.location.protocol === "http:") {
            console.log("Running on HTTP - attempting to enable insecure origins flag");
            // Chrome users can enable this at chrome://flags/#unsafely-treat-insecure-origin-as-secure
            console.log('Please enable "Insecure origins treated as secure" in chrome://flags');
        }

        // Check if browser supports permissions API
        if (navigator.permissions && navigator.permissions.query) {
            navigator.permissions
                .query({ name: "microphone" as PermissionName })
                .then((status) => {
                    console.log("Microphone permission status:", status.state);
                    setPermissionStatus(status.state);
                    status.onchange = () => {
                        console.log("Permission status changed:", status.state);
                        setPermissionStatus(status.state);
                    };
                })
                .catch((err) => {
                    console.error("Error checking permission:", err);
                });
        }
    }, []);

    useEffect(() => {
        const ws = new WebSocket(`ws://${process.env.NEXT_PUBLIC_WS_SERVER}`);
        ws.binaryType = "arraybuffer"; // Add this line
        setWsConnection(ws);

        return () => {
            ws.close();
        };
    }, []);

    const startRecording = async () => {
        try {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                throw new Error(
                    "MediaDevices API not supported. For HTTP, please enable 'Insecure origins treated as secure' in chrome://flags"
                );
            }

            const constraints = {
                audio: {
                    channelCount: 1,
                    sampleRate: 44100,
                    sampleSize: 16,
                },
            };

            const stream = await navigator.mediaDevices.getUserMedia(constraints);

            // Create Audio Context to handle raw PCM
            const audioContext = new AudioContext();
            const source = audioContext.createMediaStreamSource(stream);
            const processor = audioContext.createScriptProcessor(4096, 1, 1);

            source.connect(processor);
            processor.connect(audioContext.destination);

            processor.onaudioprocess = (e) => {
                if (wsConnection?.readyState === WebSocket.OPEN) {
                    const inputData = e.inputBuffer.getChannelData(0);
                    wsConnection.send(inputData.buffer);
                }
            };

            mediaRecorderRef.current = {
                stop: () => {
                    processor.disconnect();
                    source.disconnect();
                    audioContext.close();
                    stream.getTracks().forEach((track) => track.stop());
                },
            } as any;

            setIsRecording(true);
        } catch (error) {
            const errorMessage =
                error instanceof Error
                    ? `${error.name}: ${error.message}`
                    : "Microphone access denied. For HTTP, enable 'Insecure origins treated as secure' in chrome://flags";
            console.error("Error accessing microphone:", errorMessage);
            setError(errorMessage);
        }
    };

    // Add a function to handle permission request explicitly
    const requestPermission = async () => {
        try {
            const result = await navigator.permissions.query({ name: "microphone" as PermissionName });
            if (result.state === "denied") {
                setError("Microphone permission was denied. Please enable it in your browser settings.");
            }
        } catch (error) {
            console.error("Permission query failed:", error);
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current) {
            // Call our custom stop() method which closes audio context & stream
            mediaRecorderRef.current.stop();
            setIsRecording(false);
        }
    };

    return (
        <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-4">
            <h1 className="text-2xl font-bold mb-4">Audio Sender</h1>
            <button
                onClick={isRecording ? stopRecording : startRecording}
                className={`px-6 py-3 rounded-full ${
                    isRecording ? "bg-red-500 hover:bg-red-600" : "bg-blue-500 hover:bg-blue-600"
                } text-white transition-colors`}>
                {isRecording ? "Stop Recording" : "Start Recording"}
            </button>
            {error && <div className="text-sm text-red-600 mb-4">Error: {error}</div>}
            {permissionStatus !== "prompt" && (
                <div
                    className={`text-sm mb-4 ${permissionStatus === "granted" ? "text-green-600" : "text-yellow-600"}`}>
                    Microphone permission: {permissionStatus}
                </div>
            )}
            {permissionStatus === "denied" && (
                <button
                    onClick={requestPermission}
                    className="px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-white rounded-full text-sm">
                    Request Microphone Permission
                </button>
            )}
            {isRecording && <div className="text-sm text-gray-600">Recording and streaming audio...</div>}
        </div>
    );
}
