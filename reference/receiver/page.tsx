"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

const ReceiverClient = dynamic(() => import("./receiver-client"), {
    ssr: false,
    loading: () => (
        <div className="min-h-screen flex flex-col items-center justify-center gap-4">
            <h1 className="text-2xl font-bold mb-4">Audio Receiver</h1>
            <div className="text-sm text-gray-600">Loading...</div>
        </div>
    ),
});

export default function Page() {
    const [isMounted, setIsMounted] = useState(false);

    useEffect(() => {
        setIsMounted(true);
    }, []);

    if (!isMounted) {
        return null;
    }

    return <ReceiverClient />;
}
