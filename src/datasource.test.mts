/*
 * File: datasource.test.mts
 * Project: budibase-datasource-xata
 * File Created: Friday, 29th September 2023 0:35:53
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

import test from 'ava';

const fn = (): string => 'foo';

test('fn() returns foo', (t) => {
	t.is(fn(), 'foo');
});
