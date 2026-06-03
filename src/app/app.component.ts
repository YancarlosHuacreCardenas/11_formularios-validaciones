import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators, AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

// Definición de la interfaz del Producto
interface Producto {
  id: string;
  sku: string; // Formato PROD-XXXX
  nombre: string;
  categoria: string;
  precio: number;
  stock: number;
  fechaIngreso: string; // AAAA-MM-DD
  proveedorNombre: string;
  proveedorTelefono: string; // 9 dígitos, empieza con 9
}

// Validadores personalizados
export function telefonoValidador(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    if (!control.value) return null;
    const regex = /^9\d{8}$/;
    const esValido = regex.test(control.value);
    return esValido ? null : { telefonoInvalido: true };
  };
}

export function fechaNoPasadaValidador(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    if (!control.value) return null;
    
    // Para evitar problemas de zonas horarias en la comparación, seteamos la hora a las 00:00:00
    const partes = control.value.split('-');
    if (partes.length !== 3) return null;
    
    const selectedDate = new Date(+partes[0], +partes[1] - 1, +partes[2]);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    return selectedDate >= today ? null : { fechaPasada: true };
  };
}

// Validador personalizado para el SKU (Debe tener formato PROD-XXXX)
export function skuValidador(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    if (!control.value) return null;
    const regex = /^PROD-\d{4}$/;
    const esValido = regex.test(control.value);
    return esValido ? null : { skuInvalido: true };
  };
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit {
  title = 'Sistema de Inventario Reactivo';
  
  // Lista de productos
  productos: Producto[] = [];
  productosFiltrados: Producto[] = [];
  
  // Formulario reactivo
  productoForm!: FormGroup;
  
  // Estados de control
  isEditMode = false;
  editProductId: string | null = null;
  showFormModal = false;
  searchQuery = '';
  selectedCategory = 'Todos';
  
  // Notificaciones
  notification: { message: string; type: 'success' | 'danger' | 'info' } | null = null;
  
  // Estadísticas
  stats = {
    totalProductos: 0,
    valorTotal: 0,
    stockBajo: 0
  };

  categorias: string[] = ['Electrónica', 'Alimentos', 'Hogar', 'Moda', 'Salud/Belleza', 'Otros'];

  constructor(private fb: FormBuilder) {}

  ngOnInit(): void {
    this.initForm();
    this.cargarProductos();
  }

  // Inicialización del formulario reactivo con validaciones integradas y personalizadas
  initForm(): void {
    this.productoForm = this.fb.group({
      sku: ['', [Validators.required, skuValidador(), this.skuDuplicadoValidador()]],
      nombre: ['', [Validators.required, Validators.minLength(3)]],
      categoria: ['', [Validators.required]],
      precio: [null, [Validators.required, Validators.min(0.01)]],
      stock: [null, [Validators.required, Validators.min(0), Validators.pattern(/^[0-9]+$/)]],
      fechaIngreso: ['', [Validators.required, fechaNoPasadaValidador()]],
      proveedorNombre: ['', [Validators.required, Validators.minLength(3)]],
      proveedorTelefono: ['', [Validators.required, telefonoValidador()]]
    });
  }

  // Validador personalizado dinámico para SKU duplicados en base al estado actual
  skuDuplicadoValidador(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      if (!control.value) return null;
      
      const skuInput = control.value.toUpperCase();
      const duplicado = this.productos.some(
        prod => prod.sku.toUpperCase() === skuInput && prod.id !== this.editProductId
      );
      
      return duplicado ? { skuDuplicado: true } : null;
    };
  }

  // Carga inicial de datos de localStorage o mock predeterminado
  cargarProductos(): void {
    const data = localStorage.getItem('productos_inventario');
    if (data) {
      this.productos = JSON.parse(data);
    } else {
      // Datos de prueba iniciales
      this.productos = [
        {
          id: '1',
          sku: 'PROD-1001',
          nombre: 'Smart TV 55" 4K',
          categoria: 'Electrónica',
          precio: 450.99,
          stock: 12,
          fechaIngreso: this.getFechaActualFormat(),
          proveedorNombre: 'Tech Peru S.A.C.',
          proveedorTelefono: '987654321'
        },
        {
          id: '2',
          sku: 'PROD-1002',
          nombre: 'Cafetera Express Italiana',
          categoria: 'Hogar',
          precio: 89.90,
          stock: 3,
          fechaIngreso: this.getFechaActualFormat(),
          proveedorNombre: 'Hogar Confort',
          proveedorTelefono: '912345678'
        },
        {
          id: '3',
          sku: 'PROD-1003',
          nombre: 'Audífonos Bluetooth Noise Cancelling',
          categoria: 'Electrónica',
          precio: 129.99,
          stock: 25,
          fechaIngreso: this.getFechaActualFormat(),
          proveedorNombre: 'Distribuidora Sonido',
          proveedorTelefono: '955443322'
        }
      ];
      this.guardarEnStorage();
    }
    this.aplicarFiltros();
  }

  // Guardar cambios en el localStorage y recalcular estadísticas
  guardarEnStorage(): void {
    localStorage.setItem('productos_inventario', JSON.stringify(this.productos));
    this.calcularEstadisticas();
  }

  // Calcular métricas de inventario
  calcularEstadisticas(): void {
    this.stats.totalProductos = this.productos.length;
    this.stats.valorTotal = this.productos.reduce((sum, prod) => sum + (prod.precio * prod.stock), 0);
    this.stats.stockBajo = this.productos.filter(prod => prod.stock < 5).length;
  }

  // Filtrado de productos en tiempo real por término de búsqueda y categoría
  aplicarFiltros(): void {
    this.productosFiltrados = this.productos.filter(prod => {
      const cumpleQuery = prod.nombre.toLowerCase().includes(this.searchQuery.toLowerCase()) || 
                          prod.sku.toLowerCase().includes(this.searchQuery.toLowerCase()) ||
                          prod.proveedorNombre.toLowerCase().includes(this.searchQuery.toLowerCase());
      
      const cumpleCategoria = this.selectedCategory === 'Todos' || prod.categoria === this.selectedCategory;
      
      return cumpleQuery && cumpleCategoria;
    });
    this.calcularEstadisticas();
  }

  onSearchChange(event: any): void {
    this.searchQuery = event.target.value;
    this.aplicarFiltros();
  }

  onCategoryChange(categoria: string): void {
    this.selectedCategory = categoria;
    this.aplicarFiltros();
  }

  // Mostrar modal de formulario
  openAddModal(): void {
    this.isEditMode = false;
    this.editProductId = null;
    this.productoForm.reset({
      sku: '',
      nombre: '',
      categoria: '',
      precio: null,
      stock: null,
      fechaIngreso: this.getFechaActualFormat(),
      proveedorNombre: '',
      proveedorTelefono: ''
    });
    this.showFormModal = true;
  }

  // Editar producto existente
  openEditModal(producto: Producto): void {
    this.isEditMode = true;
    this.editProductId = producto.id;
    this.productoForm.reset({
      sku: producto.sku,
      nombre: producto.nombre,
      categoria: producto.categoria,
      precio: producto.precio,
      stock: producto.stock,
      fechaIngreso: producto.fechaIngreso,
      proveedorNombre: producto.proveedorNombre,
      proveedorTelefono: producto.proveedorTelefono
    });
    
    // Forzamos actualización de validación del SKU considerando el ID actual de edición
    this.productoForm.get('sku')?.updateValueAndValidity();
    
    this.showFormModal = true;
  }

  closeModal(): void {
    this.showFormModal = false;
  }

  // Envío del formulario (Creación o Actualización)
  onSubmit(): void {
    if (this.productoForm.invalid) {
      this.productoForm.markAllAsTouched();
      this.showToast('Por favor, corrige los errores en el formulario.', 'danger');
      return;
    }

    const formValues = this.productoForm.value;
    
    // Normalizar SKU a mayúsculas
    formValues.sku = formValues.sku.toUpperCase();

    if (this.isEditMode && this.editProductId) {
      // Actualizar producto
      const index = this.productos.findIndex(p => p.id === this.editProductId);
      if (index !== -1) {
        this.productos[index] = {
          ...this.productos[index],
          ...formValues
        };
        this.showToast('Producto actualizado correctamente.', 'success');
      }
    } else {
      // Crear producto
      const nuevoProducto: Producto = {
        id: Date.now().toString(),
        ...formValues
      };
      this.productos.unshift(nuevoProducto);
      this.showToast('Producto registrado exitosamente.', 'success');
    }

    this.guardarEnStorage();
    this.aplicarFiltros();
    this.closeModal();
  }

  // Eliminar producto
  eliminarProducto(id: string): void {
    if (confirm('¿Estás seguro de que deseas eliminar este producto del inventario?')) {
      this.productos = this.productos.filter(p => p.id !== id);
      this.guardarEnStorage();
      this.aplicarFiltros();
      this.showToast('Producto eliminado del inventario.', 'info');
    }
  }

  // Utilidades
  getFechaActualFormat(): string {
    const hoy = new Date();
    const mm = String(hoy.getMonth() + 1).padStart(2, '0');
    const dd = String(hoy.getDate()).padStart(2, '0');
    const yyyy = hoy.getFullYear();
    return `${yyyy}-${mm}-${dd}`;
  }

  showToast(message: string, type: 'success' | 'danger' | 'info'): void {
    this.notification = { message, type };
    setTimeout(() => {
      if (this.notification?.message === message) {
        this.notification = null;
      }
    }, 4000);
  }

  // Getters simplificados para validaciones en HTML
  get f() {
    return this.productoForm.controls;
  }
}
