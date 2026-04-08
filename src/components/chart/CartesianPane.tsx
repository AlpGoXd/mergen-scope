import { ChartPane } from './ChartPane';

export interface CartesianPaneProps {
	paneId: string;
}

export function CartesianPane({ paneId }: CartesianPaneProps) {
	return <ChartPane paneId={paneId} />;
}
