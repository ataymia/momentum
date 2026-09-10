"use client";

import { Eraser, PenLine, Type } from "lucide-react";
import { PointerEvent, useEffect, useRef, useState } from "react";
import type { SignatureMethod } from "../../lib/document-template-engine";
import { Button, Field, StatusPill } from "../ui";

type SignaturePadProps = {
  signerName: string;
  onChange: (method: SignatureMethod, value: string) => void;
};

export function SignaturePad({ signerName, onChange }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const [method, setMethod] = useState<SignatureMethod>("Typed");
  const [typed, setTyped] = useState(signerName);
  const [hasDrawing, setHasDrawing] = useState(false);

  useEffect(() => {
    if (method === "Typed") onChange("Typed", typed);
  }, [method, onChange, typed]);

  const context = () => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    return ctx;
  };

  const point = (event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * (canvas.width / rect.width), y: (event.clientY - rect.top) * (canvas.height / rect.height) };
  };

  const start = (event: PointerEvent<HTMLCanvasElement>) => {
    if (method !== "Drawn") return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const ctx = context();
    if (!ctx) return;
    const p = point(event);
    drawing.current = true;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  };

  const move = (event: PointerEvent<HTMLCanvasElement>) => {
    if (method !== "Drawn" || !drawing.current) return;
    const ctx = context();
    if (!ctx) return;
    const p = point(event);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    setHasDrawing(true);
  };

  const finish = (event: PointerEvent<HTMLCanvasElement>) => {
    if (method !== "Drawn" || !drawing.current) return;
    drawing.current = false;
    event.currentTarget.releasePointerCapture(event.pointerId);
    const value = event.currentTarget.toDataURL("image/png");
    onChange("Drawn", value);
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = context();
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawing(false);
    onChange("Drawn", "");
  };

  return <div className="signature-capture" aria-label="Electronic signature">
    <div className="signature-capture__switch" role="group" aria-label="Signature method">
      <Button type="button" size="sm" variant={method === "Typed" ? "primary" : "secondary"} icon={<Type size={15}/>} onClick={() => setMethod("Typed")}>Type signature</Button>
      <Button type="button" size="sm" variant={method === "Drawn" ? "primary" : "secondary"} icon={<PenLine size={15}/>} onClick={() => setMethod("Drawn")}>Draw signature</Button>
    </div>
    {method === "Typed" ? <Field label="Signature"><input value={typed} onChange={(event) => setTyped(event.target.value)} autoComplete="name"/></Field> : <div className="signature-capture__draw"><div className="signature-capture__canvas-wrap"><canvas ref={canvasRef} width={720} height={180} onPointerDown={start} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish} aria-label="Draw your signature"/></div><div className="signature-capture__footer"><StatusPill tone={hasDrawing ? "success" : "neutral"}>{hasDrawing ? "Signature captured" : "Draw in the box"}</StatusPill><Button type="button" size="sm" variant="ghost" icon={<Eraser size={14}/>} onClick={clear}>Clear</Button></div></div>}
  </div>;
}
