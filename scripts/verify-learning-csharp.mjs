/* global console */
// Verification tooling only; never used by the app or its Markdown renderer.
import { readFile, writeFile, mkdir, mkdtemp } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { resolve, join } from 'node:path'
import assert from 'node:assert/strict'

const manifest = JSON.parse(await readFile('docs/learning/manifest.json', 'utf8'))
const samples = []
for (const chapter of manifest.chapters) {
  const markdown = await readFile(join('docs/learning', chapter.contentPath), 'utf8')
  for (const match of markdown.matchAll(/```csharp\n([\s\S]*?)```/g)) samples.push({ chapter: chapter.id, code: match[1] })
}
const expectedOutputs = [
  'Điểm trung bình: 8.00',
  'An sẽ 20 tuổi, một năm có 12 tháng.',
  'Tổng: 37501.50; Trên 30.000? True',
  '3\n2\n3.4\n14\n20', 'True', '36', 'Diện tích: 19.63',
  'Đạt', 'Khá', 'Được vào sự kiện', 'Cuối tuần', 'Năm nhuận',
  '15', '2', 'Lượt 1\nLượt 2\nLượt 3', '3\n5', '*\n* *\n* * *', '1 2 3 6 9 18',
  '8\nH\n#', '4', 'hoc C# nang cao\nTrue', 'True', 'gnidoc', 'True',
  '20', '8.00', 'True\nFalse', 'Đạt\nKhông hợp lệ', '5',
  '4\n6\n10', '20', '4.333333333333333', '12', '3', '1', '5, 4, 3, 2, 1',
  '2\n2\n3', '1 2 3\n4 5 6', '15', '15\n15', '10', '3',
]
assert.equal(samples.length, expectedOutputs.length)
await mkdir('out', { recursive: true })
const directory = await mkdtemp(resolve('out/learning-csharp-'))
await writeFile(join(directory, 'Samples.csproj'), '<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>Exe</OutputType><TargetFramework>net10.0</TargetFramework><ImplicitUsings>enable</ImplicitUsings><Nullable>enable</Nullable></PropertyGroup></Project>')
await writeFile(join(directory, 'Program.cs'), 'Console.OutputEncoding = new System.Text.UTF8Encoding(false);\nSystem.Globalization.CultureInfo.CurrentCulture = System.Globalization.CultureInfo.InvariantCulture;\n'
  + samples.map((sample, i) => `Console.WriteLine("SAMPLE_${i}_BEGIN");\n{\n${sample.code}\n}\nConsole.WriteLine(); Console.WriteLine("SAMPLE_${i}_END");`).join('\n'))
execFileSync('dotnet', ['build', join(directory, 'Samples.csproj'), '--nologo', '--verbosity', 'quiet'], { windowsHide: true, stdio: 'pipe' })
const output = execFileSync('dotnet', [join(directory, 'bin/Debug/net10.0/Samples.dll')], { windowsHide: true, encoding: 'utf8' })
for (const [i, sample] of samples.entries()) {
  const start = `SAMPLE_${i}_BEGIN`, end = `SAMPLE_${i}_END`
  assert(output.includes(start) && output.includes(end))
  sample.output = output.split(start)[1].split(end)[0].trim()
  const normalized = sample.output.split(/\r?\n/).map(line => line.trimEnd()).join('\n')
  assert.equal(normalized, expectedOutputs[i], `Output mismatch in ${sample.chapter}, sample ${i + 1}`)
  sample.outputVerified = true
}
await writeFile(join(directory, 'result.json'), JSON.stringify({ result: 'PASS', sdkTarget: 'net10.0', samples }, null, 2))
console.log(JSON.stringify({ result: 'PASS', samples: samples.length, directory }))
