"use client";

import { Eraser } from "lucide-react";
import { PointerEvent, useMemo, useRef } from "react";
import type { DeliverySignaturePoint } from "../../lib/delivery-engine";
import { Button } from "../ui";

const WIDTH = 1000;
const HEIGHT = 300;
const MAX_POINTS = 1200;
const MIN_POINT_DISTANCE = 5;

type Props = {
  strokes: DeliverySignaturePoint[][];
  onChange: (strokes: DeliverySignaturePoint[][]) => void;
};

function pointFor(event: PointerEvent<SVGSVGElement>): DeliverySignaturePoint {
  const rect = event.currentTarget.getBoundingClientRect();
  const x = Math.max(0, Math.min(WIDTH, ((event.clientX - rect.left) / Math.max(rect.width, 1)) * WIDTH));
  const y = Math.max(0, Math.min(HEIGHT, ((event.clientY - rect.top) / Math.max(rect.height, 1)) * HEIGHT));
  return [Math.round(x), Math.round(y)];
}

export function DeliverySignaturePad({ strokes, onChange }: Props) {
  const activePointer = useRef<number | null>(null);
  const totalPoints = useMemo(() => strokes.reduce((sum, stroke) => sum + stroke.length, 0), [strokes]);

  const start = (event: PointerEvent<SVGSVGElement>) => {
    if (totalPoints >= MAX_POINTS) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    activePointer.current = event.pointerId;
    onChange([...strokes, [pointFor(event)]]);
  };

  const move = (event: PointerEvent<SVGSVGElement>) => {
    if (activePointer.current !== event.pointerId || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    event.preventDefault();
    const point = pointFor(event);
    const current = strokes[strokes.length - 1];
    if (!current?.length) return;
    const last = current[current.length - 1];
    const distance = Math.hypot(point[0] - last[0], point[1] - last[1]);
    if (distance < MIN_POINT_DISTANCE || totalPoints >= MAX_POINTS) return;
    onChange([...strokes.slice(0, -1), [...current, point]]);
  };

  const finish = (event: PointerEvent<SVGSVGElement>) => {
    if (activePointer.current !== event.pointerId) return;
    event.preventDefault();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    activePointer.current = null;
  };

  return <div className="delivery-signature-pad">
    <div className="delivery-signature-pad__toolbar">
      <div>
        <strong>Recipient signature</strong>
        <small>Sign with a finger, stylus, or mouse.</small>
      </div>
      <Button type="button" size="sm" variant="ghost" icon={<Eraser size={15}/>} disabled={!strokes.length} onClick={() => onChange([])}>Clear</Button>
    </div>
    <svg
      className="delivery-signature-pad__canvas"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label="Recipient signature drawing box"
      onPointerDown={start}
      onPointerMove={move}
      onPointerUp={finish}
      onPointerCancel={finish}
      onPointerLeave={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) return;
        activePointer.current = null;
      }}
    >
      <rect x="0" y="0" width={WIDTH} height={HEIGHT} rx="18" className="delivery-signature-pad__background"/>
      <line x1="55" y1="245" x2="945" y2="245" className="delivery-signature-pad__baseline"/>
      {strokes.map((stroke, index) => stroke.length > 1
        ? <polyline key={index} points={stroke.map(([x,y]) => `${x},${y}`).join(" ")} className="delivery-signature-pad__stroke"/>
        : null)}
    </svg>
    <small className="delivery-signature-pad__hint">{strokes.length ? "Signature captured. Clear to try again." : "Signature is required before the delivery can be completed."}</small>
  </div>;
}
