import { EXERCISE_LIMITS } from '../../../../shared/contracts/exercise'
import type { Exercise, ExerciseType } from '../../../../shared/contracts/practice'
import type { CsharpSampleSchema } from '../../../../shared/contracts/csharp-execution'
import { exerciseCoreError } from './exercise-limits'

const names: Readonly<Record<ExerciseType, string>> = Object.freeze({
  int32: 'int', boolean: 'bool', string: 'string', 'int32[]': 'int[]', 'string[]': 'string[]', 'int32[][]': 'int[][]',
})
const kinds: readonly ExerciseType[] = ['int32', 'boolean', 'string', 'int32[]', 'string[]', 'int32[][]']
export const CSHARP_ENTRY_POINT = 'StudentLearning.Harness'
/** Pure generation from a Main catalogue signature; no sample values or expected outputs embedded. */
export function generateCsharpHarness(exercise: Readonly<Exercise>, schema: CsharpSampleSchema): string {
  if (!/^[A-Za-z][A-Za-z0-9]*$/.test(exercise.functionName) || exercise.parameters.length > 16
    || !Number.isSafeInteger(schema.sampleCount) || schema.sampleCount < 1 || schema.sampleCount !== exercise.samples.length
    || schema.parameterTypes.length !== exercise.parameters.length || !kinds.includes(exercise.returnType)
    || schema.returnType !== exercise.returnType || !exercise.parameters.every((p, i) => kinds.includes(p.type) && p.type === schema.parameterTypes[i])) {
    throw exerciseCoreError('HARNESS_SCHEMA')
  }
  const types = [...schema.parameterTypes, schema.returnType].map(t => names[t]).join(', ')
  const declarations = schema.parameterTypes.map((t, i) => `${names[t]} arg${i} = (${names[t]})ReadValue(args[${i}], ${kinds.indexOf(t)});`).join('\n                ')
  const args = schema.parameterTypes.map((_, i) => `arg${i}`).join(', ')
  return `#nullable enable
namespace StudentLearning {
public static class Harness {
    const int Limit = ${EXERCISE_LIMITS.outputBytes};
    // Exposing Solution in a public signature also requires the class to be public.
    static T RequireClass<T>(T value) where T : class => value;
    public static global::Solution RequirePublicSolution(global::Solution value) => RequireClass(value);
    sealed class Overflow : global::System.Exception { }
    sealed class CaptureBudget { public int Characters; }
    sealed class Capture : global::System.IO.TextWriter {
        readonly CaptureBudget budget;
        readonly global::System.Text.StringBuilder text = new global::System.Text.StringBuilder();
        public Capture(CaptureBudget value) { budget = value; }
        public override global::System.Text.Encoding Encoding => global::System.Text.Encoding.UTF8;
        public override void Write(char value) {
            lock (budget) {
                if (budget.Characters >= Limit) throw new Overflow();
                budget.Characters++; text.Append(value);
            }
        }
        public override void Write(string? value) {
            if (value == null) return;
            lock (budget) {
                if (value.Length > Limit - budget.Characters) throw new Overflow();
                budget.Characters += value.Length; text.Append(value);
            }
        }
        public override string ToString() { lock (budget) return text.ToString(); }
    }
    sealed class BoundedStream : global::System.IO.MemoryStream {
        public override void Write(byte[] buffer, int offset, int count) {
            if (count > Limit - Length) throw new Overflow(); base.Write(buffer, offset, count);
        }
        public override void Write(global::System.ReadOnlySpan<byte> buffer) {
            if (buffer.Length > Limit - Length) throw new Overflow(); base.Write(buffer);
        }
        public override void WriteByte(byte value) {
            if (Length >= Limit) throw new Overflow(); base.WriteByte(value);
        }
    }
    static bool ValidString(string? value) {
        if (value == null) return false;
        for (int i = 0; i < value.Length; i++) {
            if (char.IsHighSurrogate(value[i])) { if (++i >= value.Length || !char.IsLowSurrogate(value[i])) return false; }
            else if (char.IsLowSurrogate(value[i])) return false;
        }
        return true;
    }
    static bool ValidValue(object? value, int kind) {
        switch (kind) {
            case 0: return value is int;
            case 1: return value is bool;
            case 2: return value is string s && ValidString(s);
            case 3: return value is int[];
            case 4:
                if (!(value is string[] strings)) return false;
                foreach (string item in strings) if (!ValidString(item)) return false;
                return true;
            case 5:
                if (!(value is int[][] matrix)) return false;
                int width = matrix.Length == 0 ? 0 : matrix[0]?.Length ?? -1;
                foreach (int[] row in matrix) if (row == null || row.Length != width) return false;
                return true;
            default: return false;
        }
    }
    static object ReadValue(global::System.Text.Json.JsonElement value, int kind) {
        if (kind == 0) return value.GetInt32();
        if (kind == 1) return value.GetBoolean();
        if (kind == 2) {
            string? text = value.GetString();
            if (!ValidString(text)) throw new global::System.FormatException();
            return text!;
        }
        int count = value.GetArrayLength();
        if (kind == 3) {
            int[] result = new int[count]; for (int i = 0; i < count; i++) result[i] = value[i].GetInt32(); return result;
        }
        if (kind == 4) {
            string[] result = new string[count]; for (int i = 0; i < count; i++) result[i] = (string)ReadValue(value[i], 2); return result;
        }
        int[][] rows = new int[count][];
        for (int i = 0; i < count; i++) rows[i] = (int[])ReadValue(value[i], 3);
        if (!ValidValue(rows, 5)) throw new global::System.FormatException();
        return rows;
    }
    public static int Main() {
        using var physicalOutput = global::System.Console.OpenStandardOutput();
        try {
            using var input = global::System.Console.OpenStandardInput();
            using var bytes = new BoundedStream();
            byte[] block = new byte[4096]; int read;
            while ((read = input.Read(block, 0, block.Length)) > 0) bytes.Write(block, 0, read);
            string json = new global::System.Text.UTF8Encoding(false, true).GetString(bytes.ToArray());
            using var document = global::System.Text.Json.JsonDocument.Parse(json, new global::System.Text.Json.JsonDocumentOptions { MaxDepth = 12 });
            var request = document.RootElement;
            int fields = 0;
            foreach (var property in request.EnumerateObject()) {
                int bit = property.Name == "protocolVersion" ? 1 : property.Name == "caseIndex" ? 2 : property.Name == "args" ? 4 : 0;
                if (bit == 0 || (fields & bit) != 0) return 2;
                fields |= bit;
            }
            if (fields != 7 || request.GetProperty("protocolVersion").GetInt32() != 1) return 2;
            int caseIndex = request.GetProperty("caseIndex").GetInt32();
            var args = request.GetProperty("args");
            if (caseIndex < 0 || caseIndex >= ${schema.sampleCount} || args.GetArrayLength() != ${schema.parameterTypes.length}) return 2;
            ${declarations}
            var budget = new CaptureBudget(); var stdout = new Capture(budget); var stderr = new Capture(budget);
            global::System.Console.SetOut(global::System.IO.TextWriter.Synchronized(stdout));
            global::System.Console.SetError(global::System.IO.TextWriter.Synchronized(stderr));
            object? actual = null; string? error = null;
            try {
                global::System.Func<${types}> invoke = new global::Solution().@${exercise.functionName};
                actual = invoke(${args});
                if (!ValidValue(actual, ${kinds.indexOf(schema.returnType)})) error = "INVALID_RESULT";
            } catch (Overflow) { throw; }
              catch (global::System.Exception) { error = "USER_EXCEPTION"; }
            if (!ValidString(stdout.ToString()) || !ValidString(stderr.ToString())) error = "INVALID_RESULT";
            using var response = new BoundedStream();
            using (var writer = new global::System.Text.Json.Utf8JsonWriter(response)) {
                writer.WriteStartObject(); writer.WriteNumber("protocolVersion", 1); writer.WriteNumber("caseIndex", caseIndex);
                writer.WriteString("outcome", error == null ? "RETURNED" : "FAILED");
                if (error == null) { writer.WritePropertyName("actual"); global::System.Text.Json.JsonSerializer.Serialize(writer, actual); }
                else writer.WriteString("error", error);
                writer.WriteString("stdout", ValidString(stdout.ToString()) ? stdout.ToString() : "");
                writer.WriteString("stderr", ValidString(stderr.ToString()) ? stderr.ToString() : "");
                writer.WriteEndObject(); writer.Flush();
            }
            response.Position = 0; response.CopyTo(physicalOutput); physicalOutput.Flush(); return 0;
        } catch (Overflow) {
            // Emit actual over-budget bytes so Main's EXISTING raw output limiter is authoritative.
            byte[] flood = new byte[4096];
            for (int left = Limit + 1; left > 0;) { int count = global::System.Math.Min(left, flood.Length); physicalOutput.Write(flood, 0, count); left -= count; }
            physicalOutput.Flush(); return 3;
        } catch (global::System.Exception) { return 2; }
    }
}
}
`
}
