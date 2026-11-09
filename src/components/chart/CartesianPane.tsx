import { VisibleRefLinesProvider } from '../../stores/ref-line-store';
import { ChartPane } from './ChartPane';

export interface CartesianPaneProps {
	paneId: string;
}

export function CartesianPane({ paneId }: CartesianPaneProps) {
	return <VisibleRefLinesProvider><ChartPane paneId={paneId} /></VisibleRefLinesProvider>;
}
