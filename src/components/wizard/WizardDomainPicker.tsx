import type { TraceDomain } from '../../types/trace';

export interface WizardDomainPickerProps {
	domain: TraceDomain;
	onChangeDomain: (domain: TraceDomain) => void;
}

export function WizardDomainPicker({ domain, onChangeDomain }: WizardDomainPickerProps) {
	return (
		<fieldset style={{ border: '1px solid var(--border)', borderRadius: '6px', padding: '8px' }}>
			<legend style={{ fontSize: '11px', padding: '0 4px' }}>Domain</legend>
			<label style={{ display: 'flex', gap: '6px', fontSize: '11px' }}>
				<input
					type="radio"
					name="wizard-domain"
					checked={domain === 'frequency'}
					onChange={() => onChangeDomain('frequency')}
				/>
				Frequency
			</label>
			<label style={{ display: 'flex', gap: '6px', fontSize: '11px' }}>
				<input
					type="radio"
					name="wizard-domain"
					checked={domain === 'time'}
					onChange={() => onChangeDomain('time')}
				/>
				Time
			</label>
		</fieldset>
	);
}
