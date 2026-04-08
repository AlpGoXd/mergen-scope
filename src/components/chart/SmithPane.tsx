import { useRef } from 'react';
import { SmithChart } from './SmithChart';
import type { Trace } from '../../types/trace';

export interface SmithPaneProps {
	paneId: string;
	traces: readonly Trace[];
	renderMode?: 'smith' | 'smith-inverted';
}

function downloadBlob(blob: Blob, fileName: string) {
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement('a');
	anchor.href = url;
	anchor.download = fileName;
	anchor.click();
	URL.revokeObjectURL(url);
}

export function SmithPane({ paneId, traces, renderMode = 'smith' }: SmithPaneProps) {
	const rootRef = useRef<HTMLDivElement | null>(null);

	const exportSvg = () => {
		const svgElement = rootRef.current?.querySelector('svg');
		if (!svgElement) {
			return;
		}
		const serializer = new XMLSerializer();
		const svgText = serializer.serializeToString(svgElement);
		const blob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
		downloadBlob(blob, `smith-${paneId}.svg`);
	};

	const exportPng = () => {
		const svgElement = rootRef.current?.querySelector('svg');
		if (!svgElement) {
			return;
		}
		const serializer = new XMLSerializer();
		const svgText = serializer.serializeToString(svgElement);
		const svgBlob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
		const svgUrl = URL.createObjectURL(svgBlob);

		const image = new Image();
		image.onload = () => {
			const width = svgElement.viewBox.baseVal.width || svgElement.clientWidth || 700;
			const height = svgElement.viewBox.baseVal.height || svgElement.clientHeight || 700;
			const canvas = document.createElement('canvas');
			canvas.width = Math.floor(width * 2);
			canvas.height = Math.floor(height * 2);
			const context = canvas.getContext('2d');
			if (!context) {
				URL.revokeObjectURL(svgUrl);
				return;
			}
			context.scale(2, 2);
			context.drawImage(image, 0, 0, width, height);
			canvas.toBlob((blob) => {
				if (blob) {
					downloadBlob(blob, `smith-${paneId}.png`);
				}
				URL.revokeObjectURL(svgUrl);
			}, 'image/png');
		};
		image.src = svgUrl;
	};

	return (
		<div style={{ display: 'grid', gap: '8px', height: '100%' }}>
			<div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
				<button type="button" onClick={exportPng}>Export PNG</button>
				<button type="button" onClick={exportSvg}>Export SVG</button>
			</div>
			<div ref={rootRef} style={{ minHeight: 0, flex: 1 }}>
				<SmithChart paneId={paneId} traces={[...traces]} renderMode={renderMode} />
			</div>
		</div>
	);
}
