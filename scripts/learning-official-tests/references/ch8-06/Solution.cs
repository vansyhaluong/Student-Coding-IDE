// E2-WAVE-D-REFERENCE-ONLY. Trusted developer source.
namespace WaveD.ch8_06;
public static class Solution{public static int[][] Rotate(int[][] matrix){var a=matrix.Select(row=>(int[])row.Clone()).ToArray();int n=a.Length;for(int layer=0;layer<n/2;layer++)for(int j=layer;j<n-1-layer;j++){int offset=j-layer,last=n-1-layer,top=a[layer][j];a[layer][j]=a[last-offset][layer];a[last-offset][layer]=a[last][last-offset];a[last][last-offset]=a[j][last];a[j][last]=top;}return a;}}
