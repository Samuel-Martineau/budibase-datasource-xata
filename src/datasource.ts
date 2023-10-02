/*
 * File: datasource.ts
 * Project: budibase-datasource-xata
 * File Created: Tuesday, 26th September 2023 10:02:24
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
	FieldType,
	Operation,
	RelationshipType,
	SortDirection,
	type ConnectionInfo,
	type DatasourcePlus,
	type ExternalTable,
	type QueryJson,
	type SqlQuery,
	type Table,
	type TableSchema,
	type SearchFilters,
	EmptyFilterOption,
} from '@budibase/types';
import { v4 as uuid } from 'uuid';
import _ from 'lodash';
import {
	type XataFile,
	type ExpandedColumnNotation as XataExpandedColumnNotation,
	type OffsetNavigationOptions as XataOffsetNavigationOptions,
	type SortDirection as XataSortDirection,
	type RecordArray as XataRecordArray,
} from '@xata.io/client';
import mime from 'mime-types';
import type { Simplify } from 'type-fest';
import { XataClient } from './xata.js';
import {
	buildExternalTableId,
	finaliseExternalTables,
} from './budibase-server.js';
import { isXataFileField, xataToBudibaseType } from './utils.js';
import { logger } from './logger.js';

class XataIntegration implements DatasourcePlus {
	tables: Record<string, Table> = {};
	schemaErrors: Record<string, string> = {};

	private readonly client: XataClient;
	private bindingIdentifierIndex = 1;

	constructor({
		databaseUrl,
		branch,
		apiKey,
	}: {
		databaseUrl: string;
		branch: string;
		apiKey: string;
	}) {
		this.client = new XataClient(databaseUrl, branch, apiKey);
	}

	getBindingIdentifier(): string {
		return `$${this.bindingIdentifierIndex++}`;
	}

	getStringConcat(): string {
		throw new Error('Method not implemented.');
	}

	async create(query: SqlQuery): Promise<unknown[]> {
		return this.sqlQuery(query);
	}

	async read(query: SqlQuery): Promise<unknown[]> {
		return this.sqlQuery(query);
	}

	async update(query: SqlQuery): Promise<unknown[]> {
		return this.sqlQuery(query);
	}

	async delete(query: SqlQuery): Promise<unknown[]> {
		return this.sqlQuery(query);
	}

	async getExternalSchema(): Promise<string> {
		logger.warn(
			'Exporting external schema as JSON even though SQL was requested',
		);
		return JSON.stringify(
			await this.client.api.branches.getBranchDetails(this.client.config),
			null,
			2,
		);
	}

	async buildSchema(
		datasourceId: string,
		entities: Record<string, ExternalTable>,
	): Promise<void> {
		const {
			schema: { tables: xataTables },
		} = await this.client.api.branches.getBranchDetails(this.client.config);

		const relationshipUuids: Record<string, string> = {};
		const uuidForRelationship = (table: string, column: string): string =>
			(relationshipUuids[`${table}.${column}`] ??= uuid()); // eslint-disable-line @typescript-eslint/no-unnecessary-condition

		const tables: Record<string, ExternalTable> = {};

		for (const table of xataTables) {
			const schema: TableSchema = {};
			schema.id = {
				autocolumn: true,
				name: 'id',
				type: FieldType.STRING,
				externalType: 'string',
			};
			for (const column of table.columns) {
				if (column.type === 'link' && column.link) {
					schema['$' + column.name] = {
						autocolumn: true,
						name: '$' + column.name,
						type: FieldType.STRING,
						externalType: 'string',
						visible: false,
						sortable: false,
					};
					schema[column.name] = {
						name: column.name,
						tableId: buildExternalTableId(datasourceId, column.link.table),
						relationshipType: RelationshipType.ONE_TO_MANY,
						type: FieldType.LINK,
						main: false,
						foreignKey: '$' + column.name,
						fieldName: 'id',
						// @ts-expect-error The type definition doesn't allow this, but it is required to prevent Budibase from being confused about the multiple relationships
						_id: uuidForRelationship(table.name, column.name),
						sortable: false,
					};
				} else {
					schema[column.name] = {
						name: column.name,
						type: xataToBudibaseType(column.type),
						externalType: column.type,
						sortable: column.type !== 'object',
					};
				}
			}

			for (const revLink of table.revLinks ?? []) {
				schema[revLink.table] = {
					name: revLink.table,
					tableId: buildExternalTableId(datasourceId, revLink.table),
					relationshipType: RelationshipType.MANY_TO_ONE,
					type: FieldType.LINK,
					main: true,
					foreignKey: 'id',
					fieldName: '$' + revLink.column,
					// @ts-expect-error Same as above
					_id: uuidForRelationship(revLink.table, revLink.column),
				};
			}

			tables[table.name] = {
				primary: ['id'],
				name: table.name,
				sourceId: 'datasourceId',
				_id: buildExternalTableId(datasourceId, table.name),
				schema,
			};
		}

		const final = finaliseExternalTables(tables, entities);
		this.tables = final.tables;
		this.schemaErrors = final.errors;
	}

	async getTableNames(): Promise<string[]> {
		const {
			schema: { tables },
		} = await this.client.api.branches.getBranchDetails(this.client.config);
		return tables.map((t) => t.name);
	}

	async query(query: QueryJson): Promise<unknown[]> {
		const table = this.client.db[query.endpoint.entityId];
		if (!table)
			throw new Error(`Table "${query.endpoint.entityId}" does not exist`);

		switch (query.endpoint.operation) {
			case Operation.READ: {
				const { fields, fieldsMapping, reverseRelationshipFields } =
					this.parseQueryFields(query);

				let records = await table
					.select(fields)
					.filter(
						this.parseQueryFilter(
							query,
							fieldsMapping,
							reverseRelationshipFields,
						),
					)
					.sort(...this.parseQuerySort(query))
					.getMany({
						pagination: this.parseQueryPagination(query),
					});

				if (
					records.length === 0 &&
					query.filters?.onEmptyFilter === EmptyFilterOption.RETURN_ALL
				) {
					records = await table
						.select(fields)
						.sort(...this.parseQuerySort(query))
						.getMany();
				}

				return this.xataToBudibaseRecords(
					records,
					fieldsMapping,
					reverseRelationshipFields,
				);
			}

			case Operation.CREATE:
			case Operation.UPDATE: {
				const id = this.parseQueryRecordId(query);

				const { fieldsMapping, reverseRelationshipFields } =
					this.parseQueryFields(query);

				const resolvedBody = _.mapKeys(query.body ?? {}, (_value, key) => {
					const relationship = query.relationships?.find((r) => r.from === key);
					return relationship?.column ?? key;
				});

				const record = await table.createOrReplace(id, resolvedBody);

				return this.xataToBudibaseRecords(
					[record],
					fieldsMapping,
					reverseRelationshipFields,
				);
			}

			case Operation.DELETE: {
				const id = this.parseQueryRecordId(query);
				if (typeof id !== 'string')
					throw new Error('No id provided for delete operation');
				await table.deleteOrThrow(id);
				return [{ deleted: true }];
			}

			default: {
				throw new Error(
					`Operation type "${query.endpoint.operation}" is not supported`,
				);
			}
		}
	}

	async testConnection(): Promise<ConnectionInfo> {
		try {
			await this.client.api.user.getUser();
			return { connected: true };
		} catch (error) {
			if (error instanceof Error) {
				return {
					connected: false,
					error: error.message,
				};
			}

			throw error;
		}
	}

	private async sqlQuery(query: SqlQuery): Promise<unknown[]> {
		const { records } = await this.client.sql(
			query.sql,
			...(query.bindings ?? []),
		);
		return records;
	}

	private parseQueryPagination(
		query: QueryJson,
	): Required<XataOffsetNavigationOptions> {
		const queryPagination = query.paginate ?? { limit: 100 };
		const size = queryPagination.limit;
		const page =
			typeof queryPagination.page === 'number'
				? queryPagination.page
				: Number(queryPagination.page ?? '1');
		const offset = (page - 1) * size;
		return { size, offset };
	}

	private parseQuerySort(query: QueryJson): [string, XataSortDirection] {
		const querySort = query.sort ?? {};
		const querySchema = query.meta?.table?.schema ?? {};

		const defaultSortField = 'id';
		const defaultSortDirection = SortDirection.ASCENDING;

		let [sortField, { direction: sortDirection }] = Object.entries(
			querySort,
		)[0] ?? [defaultSortField, { direction: defaultSortDirection }];

		if (querySchema[sortField]?.sortable === false) {
			logger.warn(
				'Sorting by unsortable field "%s". Using "%s" instead',
				sortField,
				defaultSortField,
			);
			sortField = defaultSortField;
			sortDirection = defaultSortDirection;
		}

		return [
			sortField,
			sortDirection === SortDirection.ASCENDING ? 'asc' : 'desc',
		];
	}

	private parseQueryFields(query: QueryJson): {
		fields: Array<XataExpandedColumnNotation | string>;
		fieldsMapping: Record<string, string>;
		reverseRelationshipFields: string[];
	} {
		const queryFields = query.resource?.fields ?? [];
		const queryRelationships = query.relationships ?? [];

		const reverseRelationshipFields = queryRelationships
			.filter((r) => r.from === 'id')
			.map((r) => r.column);

		const fieldsMapping: Record<string, string> = {};
		const fields: Array<XataExpandedColumnNotation | string> = [];

		outer: for (const field of queryFields) {
			const { table, column } =
				/^(?<table>\w+).(?<column>\$?\w+)$/.exec(field)?.groups ?? {};
			if (!table || !column) {
				throw new Error(`Invalid field: "${field}"`);
			}

			for (const relationship of queryRelationships) {
				if (!relationship.from || !relationship.to) continue;

				if (table !== relationship.tableName) {
					continue;
				}

				if (reverseRelationshipFields.includes(relationship.column)) {
					if (column.startsWith('$')) {
						fieldsMapping[field] = 'id';
						continue outer;
					}

					const previous = fields.find(
						(f) => typeof f === 'object' && f.as === relationship.column,
					);

					if (typeof previous === 'object' && previous.columns) {
						previous.columns.push(column);
					} else {
						fields.push({
							name: `<-${relationship.tableName}.${relationship.to.slice(1)}`,
							columns: [column],
							as: relationship.column,
						});
					}

					fieldsMapping[field] = `${relationship.column}.${column}`;
				} else {
					fields.push(
						(fieldsMapping[field] = `${relationship.column}.${column}`),
					);
				}

				continue outer;
			}

			if (table !== query.endpoint.entityId) {
				throw new Error(`Invalid field: "${field}"`);
			}

			fields.push(
				(fieldsMapping[field] = column.startsWith('$')
					? `${column.slice(1)}.id`
					: column),
			);
		}

		const expandedFields = fields.flatMap((f) =>
			typeof f === 'string' &&
			!f.includes('.') &&
			['file', 'file[]'].includes(
				query.meta?.table?.schema[f]?.externalType ?? '',
			)
				? ['size', 'name', 'mediaType', 'url', 'signedUrl'].map(
						(p) => `${f}.${p}`,
				  )
				: f,
		);

		return { fields: expandedFields, fieldsMapping, reverseRelationshipFields };
	}

	private parseQueryFilter(
		query: QueryJson,
		fieldsMapping: Record<string, string>,
		reverseRelationshipFields: string[],
	): Record<string, any> {
		const { onEmptyFilter, allOr, ...filters } = query.filters ?? {};
		type SearchFilterKey = keyof typeof filters;
		type SearchFilterValue<T extends SearchFilterKey> = Simplify<
			Array<Required<SearchFilters>[T][string]>
		>;

		const joinOperator = allOr ? '$any' : '$all';

		const transformed = _.chain(filters)
			.mapValues((v) =>
				_.transform(
					v ?? {},
					(result, value, key) =>
						(result[key.replace(/^\d+:/, '')] ??= []).push(value), // eslint-disable-line @typescript-eslint/no-unnecessary-condition -- https://github.com/typescript-eslint/typescript-eslint/issues/6635
					{} as Record<string, unknown[]>,
				),
			)
			.transform(
				(result, value, key) => {
					if (value)
						result.push(
							...Object.entries(value).flatMap(([field, value]) => {
								const transformedField = fieldsMapping[field] ?? field;
								if (
									reverseRelationshipFields.some((r) =>
										transformedField.startsWith(`${r}.`),
									)
								) {
									logger.warn(
										'Filtering by unfilterable field "%s". Ignoring',
										transformedField,
									);
									return [];
								}

								return [
									{
										type: key as SearchFilterKey,
										field: transformedField,
										value,
									},
								];
							}),
						);
				},
				[] as Array<{
					type: SearchFilterKey;
					field: string;
					value: unknown[];
				}>,
			)
			// eslint-disable-next-line array-callback-return
			.map(({ field, value, type }) => {
				switch (type) {
					case 'string': {
						const typedValue = value as SearchFilterValue<'string'>;
						return {
							[field]: {
								[joinOperator]: typedValue.map((v) => ({ $startsWith: v })),
							},
						};
					}

					case 'range': {
						const typedValue = value as SearchFilterValue<'range'>;
						return {
							[field]: {
								$ge:
									_.max(typedValue.map(({ low }) => Number(low))) ??
									-Number.MIN_SAFE_INTEGER,
								$le:
									_.min(typedValue.map(({ high }) => Number(high))) ??
									-Number.MAX_SAFE_INTEGER,
							},
						};
					}

					case 'oneOf': {
						const typedValue = value as SearchFilterValue<'oneOf'>;
						return { [field]: { $any: typedValue.flat(1) } };
					}

					case 'contains': {
						const typedValue = value as SearchFilterValue<'contains'>;
						return {
							[field]: {
								[joinOperator]: typedValue.map((v) => ({
									$contains: v as unknown,
								})),
							},
						};
					}

					case 'containsAny': {
						const typedValue = value as SearchFilterValue<'containsAny'>;
						return {
							[field]: {
								[joinOperator]: typedValue.map((l) => ({
									$any: l.map((v) => ({ $contains: v as unknown })),
								})),
							},
						};
					}

					case 'notContains': {
						const typedValue = value as SearchFilterValue<'notContains'>;
						return {
							[field]: {
								[joinOperator]: typedValue.map((v) => ({
									$not: { $contains: v as unknown },
								})),
							},
						};
					}

					case 'notEmpty': {
						return { $exists: field };
					}

					case 'empty': {
						return { $notExists: field };
					}

					case 'equal': {
						const typedValue = value as SearchFilterValue<'equal'>;
						return {
							[field]: {
								[joinOperator]: typedValue.map((v) => ({ $is: v as unknown })),
							},
						};
					}

					case 'notEqual': {
						const typedValue = value as SearchFilterValue<'notEqual'>;
						return {
							[field]: {
								[joinOperator]: typedValue.map((v) => ({
									$isNot: v as unknown,
								})),
							},
						};
					}

					case 'fuzzy': {
						const typedValue = value as SearchFilterValue<'fuzzy'>;
						return {
							[field]: {
								[joinOperator]: typedValue.map((v) => ({
									$pattern: `*${v
										.replaceAll('*', '\\*')
										.replaceAll('?', '\\?')}*`,
								})),
							},
						};
					}
				}
			})
			.value();

		return { [joinOperator]: transformed };
	}

	private parseQueryRecordId(query: QueryJson): string | undefined {
		return query.extra?.idFilter?.equal?.id as string | undefined;
	}

	private xataToBudibaseRecords(
		xataRecords: XataRecordArray<any> | Array<XataRecordArray<any>[number]>,
		fieldsMapping: Record<string, string>,
		reverseRelationshipFields: string[],
	): unknown[] {
		const budibaseRecords = xataRecords.flatMap((record) => {
			const baseRecord = _.omit(record, reverseRelationshipFields);
			const zippedRelationships = _.zip(
				...reverseRelationshipFields.map(
					(c) =>
						(record[c]?.records as unknown[] | undefined)?.map((r) => ({
							[c]: r,
						})) ?? [],
				),
			);

			return (
				zippedRelationships.length === 0 ? [[]] : zippedRelationships
			).map((subRecords) =>
				Object.fromEntries(
					Object.entries(fieldsMapping).map(([budibaseField, xataField]) => {
						const value = _.get(
							Object.assign({}, baseRecord, ...subRecords),
							xataField,
						) as unknown;
						if (isXataFileField(value)) {
							return [
								budibaseField,
								[value].flat().map((file: XataFile) => ({
									size: file.size,
									name: file.name,
									extension: mime.extension(file.mediaType) || 'txt',
									key: file.url,
									url: file.signedUrl,
								})),
							];
						}

						return [budibaseField, value];
					}),
				),
			);
		});
		return budibaseRecords;
	}
}

export default XataIntegration;
