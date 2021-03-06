import FieldBuilder from './builder';
import { SchemaTypes } from '../types';

export default class InterfaceFieldBuilder<
  Types extends SchemaTypes,
  ParentShape
> extends FieldBuilder<Types, ParentShape, 'Interface'> {
  constructor(name: string, builder: GiraphQLSchemaTypes.SchemaBuilder<Types>) {
    super(name, builder, 'Interface', 'Interface');
  }
}
