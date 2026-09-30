import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class ChatRailApi implements ICredentialType {
	name = 'chatRailApi';

	displayName = 'ChatRail API';

	icon: Icon = { light: 'file:../icons/chatrail.svg', dark: 'file:../icons/chatrail.dark.svg' };

	documentationUrl = 'https://github.com/chatrailhq/chatrail-n8n?tab=readme-ov-file#credentials';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			placeholder: 'cr_live_...',
			description:
				'A workspace API key from the ChatRail dashboard. Sending needs messages:write, checks and lookups need messages:read, and the trigger needs webhooks:write.',
		},
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: 'https://www.chatrail.dev',
			description: 'Only change this if ChatRail support gave you a different API address',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl}}',
			url: '/v1/connections',
			method: 'GET',
		},
	};
}
