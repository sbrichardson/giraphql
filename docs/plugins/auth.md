---
name: Auth
menu: Plugins
---

# Auth Plugin

This plugin provides a way to handle authorization/permissions checks throughout your schema.

Because GraphQL schemas are graphs and fields can be aliased in responses, knowing what data is accessed at the root a query can be very difficult. Using a traditional pattern of performing checks at the start of a request, or by introspecting the result of a request does not work well, since data may be queried through a complex set of relations, and the resulting response can have fields aliased to any other name.

The GiraphQL auth plugin tries to solve a number of common authorization patterns/problems:

* Simple checks on any field in a schema \(At the Query/Mutation level, or nested deep inside a

  schema\)

* Checks that run before resolving any field of a specific type
* Checks that run after resolving any field of a specific type
* Defining reusable permissions that are used by multiple field on the same object
* Granting permissions from a parent field to the objects/types it returns

## Usage

### Install

```bash
yarn add @giraphql/plugin-auth
```

### Setup

```typescript
import SchemaBuilder from '@giraphql/core';
import '@giraphql/plugin-auth';

const builder = new SchemaBuilder({
    plugins: ['GiraphQLAuth'],
    authOptions: {
        // when true (default) fields not covered by a permission check will return an Authorization error
        requirePermissionChecks: true,
        // when true (default) mutation fields will not be authorized unless they are protected by a
        // permission check defined directly on the mutation field (NOT from `defaultPermissionCheck`).
        explicitMutationChecks: true,
    },
});
```

### Add a permission check to a resolver

```typescript
builder.queryType({
  fields: t => ({
    hello: t.string({
      permissionCheck: (parent, args, context) => {
        // only say hello to people who capitalize their name
        return name[0] === args[0].toUpperCase(),
      },
      args: {
        name: t.arg.string({ required: true }),
      },
      resolve: (parent, { name }) => `hello, ${name}`,
    }),
  }),
});
```

This check will run before the resolver for `Query.hello` runs and will return an authorization error for any request where the name is not capitalized.

### Reusing permission checks

As you add more fields to your schema, you may want to re-use the same permission checks on multiple fields:

```typescript
builder.queryType({
    permissions: {
        user: (parent, context) => !!context.user,
        admin: async (parent, context) => {
            if (!context.user) {
                return false;
            }
            // permission checks can be async
            const roles = await context.user.roles();

            return roles.includes('Admin');
        },
    },
    fields: (t) => ({
        helloAdmin: t.string({
            // permissionCheck can be a permission name (striing)
            permissionCheck: 'admin',
            resolve: (parent) => `hello Admin`,
        }),
        helloUser: t.string({
            // permissionCheck can be an array of permission names
            permissionCheck: ['user'],
            resolve: (parent) => `hello Admin`,
        }),
        hello: t.string({
            // permissionCheck can be a function that returns a boolean, or descriibe a set of permissions
            // required to resolve the field.
            permissionCheck: (parent, args, context) => {
                // only say hello to people who capitalize their name
                if (args.name[0] === args[0].toUpperCase()) {
                    // return boolean as a basic check
                    return false;
                }

                // return name of a permission that is required to read this field
                return 'user';

                // return a list of permissiion names to requiire multiple permissions
                return ['user', 'admin']; // or { all: ['user', 'admin'] }

                // permissionCheck can also return a `PermissionMatcher` object for more advanced checks
                // that depend on complex checks (See API section below for more details)
                return { any: ['admin', { all: ['user', 'helloAccess'] }] };
            },
            args: {
                name: t.arg.string({ required: true }),
            },
            resolve: (parent, { name }) => `hello, ${name}`,
        }),
    }),
});
```

The `permissions` option allows you to create reusable permission checks that can be referenced by `permissionCheck` on any field on that type. Permissions defined using `permissions` option do _NOT_ work with `extends` fields from `@giraphql/plugin-extends` since those fields would have a different parent type.

If multiple fields of an object use the same permission, the result of that check will be cached, and the check function will only be called once. This caching will only apply for checks called with the same `parent` object, so if the check exists on a type that is returned in a list, the check will be called for each object in that list.

## Default permission checks

Often most fields on a type will use the same permission checks. To make this a little simpler, you can set default permission checks for a type that will be applied to any fields that do not explicitly set a permission check.

```typescript
builder.queryType({
    permissions: {
        user: (parent, context) => !!context.user,
        admin: (parent, context) => !!context.user && context.user.isAdmin(),
    },
    defaultPermissionCheck: 'user',
    fields: (t) => ({
        hello: t.string({
            // uses default user check from `defaultPermissionCheck`
            resolve: (parent, { name }) => `hello, World`,
        }),
        helloAdmin: t.string({
            // does NOT use the user check from defaultPermissionCheck
            permissionCheck: 'admin',
            resolve: (parent, { name }) => `hello Admin`,
        }),
    }),
});
```

## Granting permission checks to children

There are often cases where either it is more efficient to do a permission check once in a parent resolver, or the context you need to determine if a request should be authorized is not available in a child resolver. The naive solution would be to simple do the check in the parent, and not have permission checks for you child resolvers. Unfortunately this is susceptible to creating problems down the road if there are new resolvers that expose the same type, but forget that they need to add an auth check for the children. To address these kinds of use cases, the auth plugin allows fields to define a set of permissions to grant to the returned child.

```typescript
builder.queryType({
    fields: (t) => ({
        people: t.field({
            type: ['Person'],
            // always allow querying for users, but fields on the returned users still have permission
            // checks.
            permissionCheck: () => true,
            grantPermissions: (parent, { name }, context) => {
                // conditionally grants user and admin permissions for the returned person
                return {
                    user: !!context.user,
                    admini: context.user.isAdmin(),
                };
            },
            resolve: (parent, args, { Users }) => Users.getAll(),
        }),
    }),
});

builder.objectType('Person', {
    fields: (t) => ({
        firstName: t.exposeString('firstName', {
            // check for `user` permission which may have been granted by the grantPermissions option on `Query.people`
            permissionCheck: 'user',
        }),
        email: t.exposeString('email', {
            // check for `admin` permission which may have been granted by the grantPermissions option on `Query.people`
            permissionCheck: 'admin',
        }),
    }),
});
```

## Running permission checks for all resolvers for a type

As your schema gets more complicated, some types may be reference by fields on a lot of different types. This can make it hard to keep all the permission checks for this popular type in sync and ensure that all fields have appropriate checks. To make this simpler there is a `preResolveCheck` you can add to object types that allows you to define a check that will run before any resolver for that type.

```typescript
builder.queryType({
    fields: (t) => ({
        people: t.field({
            type: ['Person'],
            resolve: (parent, args, { Users }) => Users.getAll(),
        }),
    }),
});

builder.objectType('Person', {
    // Run before the resolver for Query.people
    preResolveCheck: (context) => {
        if (!context.user) {
            return false;
        }

        return {
            readUserFields: true,
            readEmail: context.user.isAdmin(),
        };
    },
    fields: (t) => ({
        firstName: t.exposeString('firstName', {
            permissionCheck: 'readUserFields',
        }),
        email: t.exposeString('email', {
            permissionCheck: 'readEmail',
        }),
    }),
});
```

the `preResolveCheck` only receives the `context` object because the `parent` and args will vary depending on which resolver is being called. It can return a map of authorizations the same way an auth check on a field can. This approach allows you to define all of the auth for your type in one place, and is the recommended path for applications where you want more ridged controls over your permission checks. The check function may return a boolean, or a map of permissions.

Because the `preResolveCheck` only receives the context object, it will be run at most once per request and its result will be cached for subsequent fields of the same kind.

One thing to note about `preResolveCheck` is that checks for all members of a union field, and all implementors of an interface will be run before fields that return a union or interface, since there is no way to determine the actual type before resolving. This can be disabled with the `skipPreResolveOnInterfaces` and `skipPreResolveOnUnions` options for the plugin, or by setting `skipImplementorPreResolveChecks` on the interface or `skipMemberPreResolveChecks` on the union.

Another option is to use `postResolveCheck`s, which will run for each instance of a type after it has been resolved, and will work with interface and unions fields as well.

```typescript
builder.interfaceType('Shape', {
    fields: (t) => ({
        // interface fields
    }),
});

builder.objectType('Square', {
    interfaces: ['Shape'],
    isTypeOf: (parent) => parent.type === 'square',
    // Will execute for each square returned by Query.shapes and grand the readSquare permission
    // which is required for the size field
    postResolveCheck: (parent, context, info) => {
        return { readSquare: true };
    },
    fields: (t) => ({
        size: t.float({
            permissionCheck: 'readSquare',
            resolve: ({ edgeLength }) => edgeLength ** 2,
        }),
    }),
});

builder.queryFields((t) => ({
    shapes: t.field({
        type: ['Shape'],
        // always allow this resolver to execute
        permissionCheck: () => true,
        resolve: () => {
            return [{ type: 'square', edgeLength: 4 }];
        },
    }),
}));
```

## API

TODO

