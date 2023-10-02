/*
 * File: xata.ts
 * Project: budibase-datasource-xata
 * File Created: Saturday, 23rd September 2023 16:37:08
 * Author: Samuel Martineau (samuel@smartineau.me)
 *
 * budibase-datasource-xata. Copyright (C) 2023 Samuel Martineau
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

import {
	buildClient,
	XataApiClient,
	type getBranchDetails as GetBranchDetails,
} from '@xata.io/client';
import { fetch } from 'undici';

export class XataClient extends buildClient()<any> {
	readonly api: XataApiClient;
	readonly config: {
		branch: string;
		workspace: string;
		region: string;
		database: string;
	};

	constructor(databaseURL: string, branch: string, apiKey: string) {
		super({ databaseURL, branch, apiKey, fetch }); // eslint-disable-line @typescript-eslint/naming-convention
		try {
			const { workspace, region, database } =
				/^https:\/\/(?<workspace>.*)\.(?<region>.*).xata.sh\/db\/(?<database>.*)$/.exec(
					databaseURL,
				)?.groups ?? {};
			if (!workspace || !region || !database)
				throw new Error('Invalid database URL');
			this.config = { branch, workspace, region, database };
			this.api = new XataApiClient({ apiKey, fetch });
		} catch {
			throw new Error('Invalid database URL');
		}
	}
}

export type XataColumnType = Awaited<
	ReturnType<typeof GetBranchDetails>
>['schema']['tables'][number]['columns'][number]['type'];
