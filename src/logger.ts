/*
 * File: logger.ts
 * Project: budibase-datasource-xata
 * File Created: Sunday, 24th September 2023 14:49:50
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

import path from 'node:path';
import winston from 'winston';

export const logger = winston.createLogger({
	level: 'info',
	format: winston.format.combine(
		winston.format.splat(),
		winston.format.simple(),
	),
	transports: [
		process.env.NODE_ENV === 'dev'
			? new winston.transports.File({
					filename: 'logs.log',
					dirname: path.join(__dirname, '../'),
			  })
			: new winston.transports.Console(),
	],
});
