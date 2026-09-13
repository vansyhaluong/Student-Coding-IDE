// Build-time development observation only. Never imported by the application.
export function mainDiagnosticsTrace(source, path) {
  const trace = "globalThis.__csharpTrace"
  if (path.endsWith('csharp-ls-adapter.ts')) source = source.replace('() => { /* drained; no raw logs or lifecycle inference */ }', `params => {
    if (method==='window/logMessage') globalThis.__csharpTrace('provider.log', {type:params?.type,message:params?.message?.replaceAll(process.env.USERPROFILE ?? '<none>', '<user>').slice(0,2000)});
  }`)

  if (path.endsWith('language-ipc-service.ts')) source = source.replace('handle: (v, ctx) => s.diagnostics(v, ctx)', `handle: async (v, ctx) => {
    ${trace}('ipc.request', {version:v.documentVersion});
    const result = await s.diagnostics(v, ctx);
    ${trace}('ipc.response', {version:result.documentVersion,codes:result.diagnostics.map(d=>d.code)});
    return result;
  }`)
  if (path.endsWith('lsp-connection.ts')) source += `
    for (const method of ['request', 'notify']) {
      const original = LspConnection.prototype[method];
      LspConnection.prototype[method] = async function(...args) {
        const wire = args[method === 'request' ? 1 : 0];
        const params = args[method === 'request' ? 2 : 1];
        if (!['textDocument/diagnostic','textDocument/didOpen','textDocument/didChange','textDocument/didSave'].includes(wire)) return original.apply(this,args);
        ${trace}('wire.' + wire + '.send', {version:params?.textDocument?.version, previousResultId:params?.previousResultId});
        try { const result = await original.apply(this,args);
          ${trace}('wire.' + wire + '.response', {kind:result?.kind, resultId:result?.resultId, codes:result?.items?.map(d=>d.code)});
          return result;
        } catch(error) { ${trace}('wire.' + wire + '.error', {reason:error.reason}); throw error; }
      };
    }
  `
  if (path.endsWith('csharp-semantic-service.ts')) {
    source = source.replace('const report = await adapter.documentDiagnosticReport(operation, uri)', `${trace}('main.flushed', {requestedVersion:request.documentVersion, mainVersion:document.version, syncVersion:document.sync.snapshot(document.handle).version});
        const report = await adapter.documentDiagnosticReport(operation, uri)`)
    source = source.replace('kind: report.kind, diagnostics: normalizeCsharpDiagnostics(report.items)', `kind: report.kind, diagnostics: (() => {const diagnostics = normalizeCsharpDiagnostics(report.items); ${trace}('main.normalized', {version:request.documentVersion,codes:diagnostics.map(d=>d.code)});return diagnostics;})()`)
  }
  return source
}

export function preloadDiagnosticsTrace(source) {
  return source.replace('const result = await invokeSafely(ipc, LANGUAGE_CHANNELS[method], validation.value)', `
    if(method==='getDiagnostics') console.log('CSHARP_PRELOAD_TRACE', JSON.stringify({stage:'preload.send',version:validation.value.documentVersion}));
    const result = await invokeSafely(ipc, LANGUAGE_CHANNELS[method], validation.value);
    if(method==='getDiagnostics') console.log('CSHARP_PRELOAD_TRACE', JSON.stringify({stage:'preload.receive',ok:result.ok,accepted:result.ok && reply(method,result.value),version:result.value?.documentVersion,codes:result.value?.diagnostics?.map(d=>d.code)}));
  `)
}

export function rendererDiagnosticsTrace(source, id) {
  const original = source
  const trace = 'globalThis.__diagnosticTrace'
  if (id.endsWith('/csharp-client.ts')) {
    source = source.replace('private accept(event: EditorDocumentLifecycleEvent): void {', `private accept(event: EditorDocumentLifecycleEvent): void {
      ${trace}.push({stage:'document.event',type:event.type});`)
    source = source.replace('sent = true', `${trace}.push({stage:'client.synced',version,syncedVersion:document.syncedVersion,opened:document.opened}); sent = true`)
    source = source.replace('const value = this.unwrap(result)', `if(result.ok && result.value && typeof result.value==='object' && 'diagnostics' in result.value) ${trace}.push({stage:'renderer.dto',version:result.value.documentVersion,kind:result.value.kind,codes:result.value.diagnostics.map(d=>d.code)});
      const value = this.unwrap(result)`)
  }
  if (id.endsWith('/csharp-diagnostics-controller.ts')) {
    source = source.replace('private schedule(): void {', `private schedule(): void { ${trace}.push({stage:'scheduler',enabled:this.enabled,stopped:this.stopped,projectMatches:this.store.getSnapshot().projectId===this.client.project});`)
    source = source.replace('pull.requestedVersion = version', `${trace}.push({stage:'pull.start',version,revision}); pull.requestedVersion = version`)
    source = source.replace('const current = this.store.captureIdentity', `${trace}.push({stage:'pull.response',version,currentVersion:model.getVersionId(),cancelled,revision,currentRevision:pull.revision,kind:result?.kind,codes:result?.diagnostics.map(d=>d.code)}); const current = this.store.captureIdentity`)
    source = source.replace('private clear(pull: Pull): void {', `private clear(pull: Pull): void { ${trace}.push({stage:'cleanup.clear',version:pull.model.getVersionId(),appliedVersion:pull.appliedVersion});`)
    source = source.replace('private invalidate(provider: boolean): void {', `private invalidate(provider: boolean): void { ${trace}.push({stage:'cleanup.invalidate',provider});`)
  }
  if (id.endsWith('/problems-store.ts')) source += `
    const replace = ProblemsStore.prototype.replace;
    ProblemsStore.prototype.replace = function(path,batch) {
      const accepted = replace.call(this,path,batch);
      if(batch.identity.providerId==='csharp-ls') ${trace}.push({stage:'problems.replace',providerId:batch.identity.providerId,accepted,total:this.getSnapshot().totalCount});
      return accepted;
    };
  `
  if (id.endsWith('/features/editor/monaco.ts')) source += `
    const setMarkers = monaco.editor.setModelMarkers;
    monaco.editor.setModelMarkers = function(model,owner,markers) {
      if(owner==='student-ide.language.csharp-ls') ${trace}.push({stage:'monaco.markers',owner,version:model.getVersionId(),codes:markers.map(m=>m.code)});
      return setMarkers(model,owner,markers);
    };
  `
  return source === original ? source : 'globalThis.__diagnosticTrace ??= [];\n' + source
}
