import { describe, expect, it } from 'vitest'

import {
  createProjectIdentity,
  normalizePathIdentity,
  resolveProjectRelativePath,
} from '../../src/main/services/project/project-identity'

describe('project identity foundation', () => {
  it('normalizes Windows drive-letter and path case', () => {
    expect(normalizePathIdentity('C:\\Users\\Student\\Project\\', 'win32'))
      .toBe('c:\\users\\student\\project')
    expect(normalizePathIdentity('c:\\users\\STUDENT\\project', 'win32'))
      .toBe('c:\\users\\student\\project')
    expect(normalizePathIdentity('C:\\', 'win32')).toBe('c:\\')
    expect(normalizePathIdentity('\\\\Server\\Share\\', 'win32'))
      .toBe('\\\\server\\share\\')
  })

  it('creates a stable opaque identity from a canonical Windows root', async () => {
    const fileSystem = {
      realpath: async () => 'C:\\Users\\Student\\Project',
      stat: async () => ({ isDirectory: () => true }),
    }

    const first = await createProjectIdentity(
      'C:\\Users\\Student\\Project',
      fileSystem,
      'win32',
    )
    const second = await createProjectIdentity(
      'c:\\users\\student\\project',
      fileSystem,
      'win32',
    )

    expect(first.id).toBe(second.id)
    expect(first.name).toBe('Project')
    expect(first.id).toMatch(/^project_[a-f0-9]{24}$/)
  })

  it('rejects relative project roots and non-directory roots', async () => {
    const fileSystem = {
      realpath: async (value: string) => value,
      stat: async () => ({ isDirectory: () => false }),
    }

    await expect(createProjectIdentity(
      'relative\\project',
      fileSystem,
      'win32',
    )).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    await expect(createProjectIdentity(
      'C:\\project.txt',
      fileSystem,
      'win32',
    )).rejects.toMatchObject({ code: 'INVALID_INPUT' })
  })

  it('resolves only project-relative paths contained by the root', () => {
    expect(resolveProjectRelativePath(
      'C:\\Projects\\Demo',
      'src\\main.ts',
      'win32',
    )).toBe('C:\\Projects\\Demo\\src\\main.ts')
    expect(resolveProjectRelativePath(
      'C:\\',
      'Projects\\Demo',
      'win32',
    )).toBe('C:\\Projects\\Demo')

    expect(() => resolveProjectRelativePath(
      'C:\\Projects\\Demo',
      '..\\secret.txt',
      'win32',
    )).toThrow()
    expect(() => resolveProjectRelativePath(
      'C:\\Projects\\Demo',
      'D:\\secret.txt',
      'win32',
    )).toThrow()
    expect(() => resolveProjectRelativePath(
      'C:\\Projects\\Demo',
      'file.txt:secret',
      'win32',
    )).toThrow()
    expect(() => resolveProjectRelativePath(
      'C:\\Projects\\Demo',
      'NUL.txt',
      'win32',
    )).toThrow()
  })
})
