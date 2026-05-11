import React, { useState, useEffect, useRef } from 'react';
import Peer, { DataConnection } from 'peerjs';
import QRCode from 'react-qr-code';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '../lib/supabase';
import { saveVideo } from '../lib/db';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Smartphone, CheckCircle, Video, Loader2 } from 'lucide-react';

export default function PCDashboard() {
  const [sessionId] = useState(() => `capcut-${uuidv4().slice(0, 8)}`);
  const [peer, setPeer] = useState<Peer | null>(null);
  const [connection, setConnection] = useState<DataConnection | null>(null);
  const [receivedCount, setReceivedCount] = useState(0);
  const [status, setStatus] = useState<'initializing' | 'waiting' | 'connected'>('initializing');

  useEffect(() => {
    const newPeer = new Peer(sessionId);
    
    newPeer.on('open', (id) => {
      console.log('PC Peer ID:', id);
      setPeer(newPeer);
      setStatus('waiting');
    });

    newPeer.on('connection', (conn) => {
      console.log('Mobile connected!');
      setConnection(conn);
      setStatus('connected');

      conn.on('data', async (data: any) => {
        if (data.type === 'video-blob' && data.blob instanceof Uint8Array) {
          // Reconstruct blob from Uint8Array if necessary (depending on PeerJS version/env)
          const blob = new Blob([data.blob], { type: 'video/webm' });
          await saveVideo({
            id: uuidv4(),
            projectId: data.projectId,
            shotId: data.shotId,
            blob: blob,
            fileName: `shot_${data.shotId}.webm`,
            createdAt: Date.now()
          });
          setReceivedCount(prev => prev + 1);
        }
      });

      conn.on('close', () => {
        setStatus('waiting');
        setConnection(null);
      });
    });

    return () => {
      newPeer.destroy();
    };
  }, [sessionId]);

  const mobileUrl = `${window.location.origin}?mode=mobile&session=${sessionId}`;

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      <div className="text-center space-y-4">
        <h2 className="text-4xl font-bold tracking-tight">PC Control Center</h2>
        <p className="text-muted-foreground text-lg">Scan this code with your phone to start recording.</p>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        <Card className="flex flex-col items-center justify-center p-8 bg-white text-black border-none shadow-2xl">
          <div className="p-4 bg-white rounded-xl">
            <QRCode value={mobileUrl} size={250} />
          </div>
          <p className="mt-4 font-mono text-xs opacity-50 uppercase tracking-widest">{sessionId}</p>
        </Card>

        <div className="space-y-6">
          <Card className="bg-secondary/20 border-white/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Connection Status
                {status === 'waiting' && <Loader2 className="w-4 h-4 animate-spin text-yellow-500" />}
                {status === 'connected' && <CheckCircle className="w-4 h-4 text-green-500" />}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Local Node</span>
                <Badge variant="outline">READY</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Mobile Device</span>
                <Badge variant={status === 'connected' ? 'default' : 'secondary'}>
                  {status === 'connected' ? 'CONNECTED' : 'NOT FOUND'}
                </Badge>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-primary/5 border-primary/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Video className="w-5 h-5" />
                Live Inbox
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8">
                <div className="text-5xl font-black mb-2">{receivedCount}</div>
                <div className="text-muted-foreground uppercase text-xs tracking-widest">Videos Received</div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
