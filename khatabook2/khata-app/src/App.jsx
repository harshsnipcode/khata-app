import { BrowserRouter, Routes, Route } from "react-router-dom";

import AdminLogin from "./pages/Signup";
import Login from "./pages/Login";
import Home from "./pages/Home";
import EmployeeHome from "./pages/EmployeeHome";
import AdminHome from "./pages/AdminHome";
import EmployeeSetup from "./pages/EmployeeSetup";
import EmployeeDetails from "./pages/EmployeeDetails";
import EmployeeEdit from "./pages/EmployeeEdit";
import StaffDashboard from "./pages/StaffDashboard";
import Reports from "./pages/Reports";
import CustomerTransactionsReport from "./pages/CustomerTransactionsReport";
import TransactionDetails from "./pages/TransactionDetails";
import CustomerListPage from "./pages/CustomerListPage";
import CustomerForm from "./pages/CustomerForm";
import CustomerDetails from "./pages/CustomerDetails";
import CustomerProfile from "./pages/CustomerProfile";
import TransactionEntry from "./pages/TransactionEntry";
import TransactionSuccess from "./pages/TransactionSuccess";
import AddProductPage from "./pages/AddProductPage";
import ProductDetails from "./pages/ProductDetails";
import StockEntry from "./pages/StockEntry";
import StockSuccess from "./pages/StockSuccess";
import InventoryReport from "./pages/InventoryReport";
import SharedLedgerView from "./pages/SharedLedgerView";


function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/home" element={<Home />} />
        <Route path="/admin" element={<AdminLogin />} />
        <Route path="/employee/home" element={<EmployeeHome />} />
        <Route path="/admin/home" element={<AdminHome />} />
        <Route path="/admin/employees/setup" element={<EmployeeSetup />} />
        <Route path="/admin/employees/:id" element={<EmployeeDetails />} />
        <Route path="/admin/employees/:id/edit" element={<EmployeeEdit />} />
        <Route path="/admin/staff" element={<StaffDashboard />} />
        <Route path="/admin/reports" element={<Reports />} />
        <Route path="/admin/reports/customer-transactions" element={<CustomerTransactionsReport />} />
        <Route path="/admin/reports/customer-transactions/:id" element={<TransactionDetails />} />
        <Route path="/customers/add" element={<CustomerListPage />} />
        <Route path="/party/new" element={<CustomerForm />} />
        <Route path="/customer/:id" element={<CustomerDetails />} />
        <Route path="/customer/:id/profile" element={<CustomerProfile />} />
        <Route path="/customer/:id/transaction" element={<TransactionEntry />} />
        <Route path="/customer/:id/transaction/success" element={<TransactionSuccess />} />
        
        {/* Catalogue & Inventory */}
        <Route path="/catalogue/add" element={<AddProductPage />} />
        <Route path="/product/:id" element={<ProductDetails />} />
        <Route path="/product/:id/stock-in" element={<StockEntry />} />
        <Route path="/product/:id/stock-out" element={<StockEntry />} />
        <Route path="/product/:id/stock-success" element={<StockSuccess />} />
        <Route path="/catalogue/reports" element={<InventoryReport />} />
        <Route path="/share/customer/:id" element={<SharedLedgerView />} />
      </Routes>

    </BrowserRouter>
  );
}

export default App;