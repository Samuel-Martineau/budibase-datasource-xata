/*
 * File: utils.ts
 * Project: budibase-datasource-xata
 * File Created: Saturday, 23rd September 2023 19:36:12
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

import { FieldType } from '@budibase/types';
import { XataFile } from '@xata.io/client';
import { type XataColumnType } from './xata.js';

export const xataToBudibaseType = (type: XataColumnType): FieldType => {
	switch (type) {
		case 'bool': {
			return FieldType.BOOLEAN;
		}

		case 'datetime': {
			return FieldType.DATETIME;
		}

		case 'email': {
			return FieldType.STRING;
		}

		case 'file': {
			return FieldType.ATTACHMENT;
		}

		case 'file[]': {
			return FieldType.ATTACHMENT;
		}

		case 'float': {
			return FieldType.NUMBER;
		}

		case 'int': {
			return FieldType.NUMBER;
		}

		case 'json': {
			return FieldType.JSON;
		}

		case 'link': {
			throw new Error(
				'Unallowed conversion from "link" Xata column type to Budibase type',
			);
		}

		case 'multiple': {
			return FieldType.JSON;
		}

		case 'object': {
			return FieldType.JSON;
		}

		case 'string': {
			return FieldType.STRING;
		}

		case 'text': {
			return FieldType.STRING;
		}

		case 'vector': {
			return FieldType.JSON;
		}
	}
};

export const isXataFileField = (
	value: unknown,
): value is XataFile | XataFile[] =>
	[value].flat().every((v) => v instanceof XataFile);
